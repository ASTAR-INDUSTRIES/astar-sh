import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TENANT_ID = "d6af3688-b659-4f90-b701-35246b209b9d";
const AUTHORIZE_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`;
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split("/").pop();

  const CLIENT_ID = Deno.env.get("AZURE_CLIENT_ID")!;
  const CLIENT_SECRET = Deno.env.get("AZURE_CLIENT_SECRET")!;
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // The edge function URL for the callback
  const FUNCTION_BASE = `${SUPABASE_URL}/functions/v1/microsoft-auth`;
  const REDIRECT_URI = `${FUNCTION_BASE}/callback`;

  try {
    if (path === "initiate") {
      // Get the app URL to redirect back to after auth
      const appRedirect = url.searchParams.get("redirect") || url.searchParams.get("origin") || "https://id-preview--84745b5e-0dd5-43f1-bc40-eb285bd381c9.lovable.app";
      
      // Generate a random state parameter for CSRF protection
      const state = btoa(JSON.stringify({ redirect: appRedirect, nonce: crypto.randomUUID() }));

      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        scope: "openid email profile",
        response_mode: "query",
        state,
        domain_hint: "astarconsulting.no",
      });

      return new Response(null, {
        status: 302,
        headers: {
          Location: `${AUTHORIZE_URL}?${params.toString()}`,
          ...corsHeaders,
        },
      });
    }

    if (path === "callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      const errorDescription = url.searchParams.get("error_description");

      let appRedirect = "https://id-preview--84745b5e-0dd5-43f1-bc40-eb285bd381c9.lovable.app/admin";

      if (state) {
        try {
          const parsed = JSON.parse(atob(state));
          if (parsed.redirect) appRedirect = parsed.redirect;
        } catch { /* ignore parse errors */ }
      }

      if (error) {
        const errorUrl = new URL(appRedirect);
        errorUrl.searchParams.set("auth_error", errorDescription || error);
        return new Response(null, { status: 302, headers: { Location: errorUrl.toString() } });
      }

      if (!code) {
        return new Response(JSON.stringify({ error: "No authorization code" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Exchange code for tokens
      const tokenResponse = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          redirect_uri: REDIRECT_URI,
          grant_type: "authorization_code",
          scope: "openid email profile",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        console.error("Token exchange failed:", tokenData);
        const errorUrl = new URL(appRedirect);
        errorUrl.searchParams.set("auth_error", tokenData.error_description || "Token exchange failed");
        return new Response(null, { status: 302, headers: { Location: errorUrl.toString() } });
      }

      // Decode the ID token to get user info
      const idToken = tokenData.id_token;
      const payload = JSON.parse(atob(idToken.split(".")[1]));
      const email = payload.email || payload.preferred_username;
      const name = payload.name || "";

      if (!email?.endsWith("@astarconsulting.no")) {
        const errorUrl = new URL(appRedirect);
        errorUrl.searchParams.set("auth_error", "Access denied. Only @astarconsulting.no accounts are allowed.");
        return new Response(null, { status: 302, headers: { Location: errorUrl.toString() } });
      }

      // Use Supabase Admin API to create/sign in the user
      const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Check if user exists
      const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
      const existingUser = existingUsers?.users?.find((u) => u.email === email);

      let userId: string;

      if (existingUser) {
        userId = existingUser.id;
        // Update user metadata
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: { full_name: name, avatar_url: payload.picture || "" },
        });
      } else {
        // Create new user
        const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: name, avatar_url: payload.picture || "" },
        });

        if (createError || !newUser.user) {
          console.error("Failed to create user:", createError);
          const errorUrl = new URL(appRedirect);
          errorUrl.searchParams.set("auth_error", "Failed to create user account");
          return new Response(null, { status: 302, headers: { Location: errorUrl.toString() } });
        }

        userId = newUser.user.id;
      }

      // Generate a magic link / session for the user
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
      });

      if (linkError || !linkData) {
        console.error("Failed to generate link:", linkError);
        const errorUrl = new URL(appRedirect);
        errorUrl.searchParams.set("auth_error", "Failed to create session");
        return new Response(null, { status: 302, headers: { Location: errorUrl.toString() } });
      }

      // Extract the token from the magic link
      const linkUrl = new URL(linkData.properties.action_link);
      const token_hash = linkUrl.searchParams.get("token") || linkUrl.hash?.replace("#", "");
      
      // Redirect to Supabase's verify endpoint which will set the session cookie
      const verifyUrl = `${SUPABASE_URL}/auth/v1/verify?token=${linkData.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent(appRedirect)}`;

      return new Response(null, {
        status: 302,
        headers: { Location: verifyUrl },
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Microsoft auth error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
