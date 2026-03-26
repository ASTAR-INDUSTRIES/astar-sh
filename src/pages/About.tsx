import Layout from "@/components/Layout";

const TEAM = [
  { name: "ASTAR Consulting", role: "Core Team", initial: "A" },
];

const About = () => (
  <Layout>
    <h1 className="text-3xl font-mono font-bold mb-2">About ASTAR</h1>
    <p className="text-muted-foreground font-mono text-sm mb-10">
      Building the open pathfinding ecosystem.
    </p>

    <div className="space-y-12">
      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground mb-6 border-b border-border pb-3">
          Mission
        </h2>
        <p className="text-secondary-foreground leading-relaxed font-sans">
          ASTAR provides production-grade pathfinding and navigation algorithms as reusable, 
          composable modules. We believe optimal navigation should be accessible to every 
          agent developer — not locked behind proprietary implementations.
        </p>
      </section>

      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground mb-6 border-b border-border pb-3">
          What We Do
        </h2>
        <div className="grid md:grid-cols-2 gap-6">
          {[
            { title: "Open Research", desc: "Publishing peer-reviewed papers on pathfinding, graph traversal, and agent navigation." },
            { title: "Developer Tools", desc: "CLI tools and SDKs for integrating pathfinding into any agent framework." },
            { title: "Benchmarks", desc: "Standardised benchmarks for comparing algorithm performance across scenarios." },
            { title: "Consulting", desc: "Expert guidance on navigation systems for enterprise and mission-critical applications." },
          ].map((item) => (
            <div key={item.title} className="border border-border rounded-md p-5">
              <h3 className="font-mono font-medium text-sm mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground mb-6 border-b border-border pb-3">
          Team
        </h2>
        <div className="flex gap-6">
          {TEAM.map((member) => (
            <div key={member.name} className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-md bg-accent/20 text-accent flex items-center justify-center font-mono font-bold text-sm">
                {member.initial}
              </div>
              <div>
                <p className="font-mono text-sm font-medium">{member.name}</p>
                <p className="text-xs font-mono text-muted-foreground">{member.role}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground mb-6 border-b border-border pb-3">
          Contact
        </h2>
        <p className="text-sm text-muted-foreground font-mono">
          Reach us at{" "}
          <a href="mailto:hello@astarconsulting.no" className="text-accent hover:underline">
            hello@astarconsulting.no
          </a>
        </p>
      </section>
    </div>
  </Layout>
);

export default About;
