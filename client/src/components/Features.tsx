import { Link2, Ban, Search, Cpu } from "lucide-react";

const FEATURES = [
  {
    icon: Link2,
    title: "Evidence on every decision",
    body: "Each decision carries a quote from the thread and a link to the exact GitHub comment. Quotes are checked against the source, not taken on trust.",
    span: "md:col-span-3",
  },
  {
    icon: Ban,
    title: "Rejected paths, remembered",
    body: "The options your team ruled out are kept next to the one it chose, with the reason.",
    span: "md:col-span-2",
  },
  {
    icon: Search,
    title: "Investigate any thread",
    body: "Paste an issue or pull request link to get a summary and its decisions, plus the threads it links to.",
    span: "md:col-span-2",
  },
  {
    icon: Cpu,
    title: "Open-weight and local",
    body: "Analysis runs on Qwen 2.5 Coder through Ollama on your own machine. No third-party AI API sees your code.",
    span: "md:col-span-3",
  },
];

export function Features() {
  return (
    <section id="features" className="lp-reveal px-6 py-24 sm:px-8 md:py-36">
      <div className="mx-auto max-w-6xl">
        <h2 className="max-w-2xl text-[clamp(2rem,4.5vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
          Built to be believed.{" "}
          <span className="lp-display text-lp-glow">Nothing without a source.</span>
        </h2>

        <div className="mt-14 grid gap-4 md:grid-cols-5">
          {FEATURES.map(({ icon: Icon, title, body, span }) => (
            <article key={title} className={`lp-panel p-7 md:p-9 ${span}`}>
              <Icon className="h-5 w-5 text-lp-glow" />
              <h3 className="mt-10 text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-lp-mute">{body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
