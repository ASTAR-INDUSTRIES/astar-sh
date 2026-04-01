CREATE TABLE public.feedback (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  content text NOT NULL,
  type text DEFAULT 'feature' CHECK (type IN ('bug', 'feature', 'pain', 'praise')),
  source text DEFAULT 'human' CHECK (source IN ('human', 'agent')),
  author_email text NOT NULL,
  author_name text,
  linked_skill text,
  linked_news text,
  context jsonb DEFAULT '{}',
  status text DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'rejected', 'done')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON public.feedback FOR SELECT USING (true);
CREATE POLICY "Authenticated insert" ON public.feedback FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated update" ON public.feedback FOR UPDATE TO authenticated USING (true);