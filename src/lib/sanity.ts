import { createClient } from "@sanity/client";

export const sanityClient = createClient({
  projectId: "fkqm34od",
  dataset: "production",
  apiVersion: "2024-01-01",
  useCdn: true,
});
