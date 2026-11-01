const STEPS = [
  {
    n: "01",
    title: "Connect a repository",
    body: "Install the GitHub App, or paste the URL of a public repo.",
  },
  {
    n: "02",
    title: "Run the analysis",
    body: "A local open-weight model reads each issue and pull request thread and pulls out the decisions.",
  },
  {
    n: "03",
    title: "Read the why",
    body: "Every decision links to the comments that support it, along with the options the team rejected.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="lp-reveal px-6 py-24 sm:px-8 md:py-36">
      <div className="mx-auto max-w-6xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-lp-mute">
          How it works
        </p>
        <ol className="mt-12 grid gap-px overflow-hidden rounded-3xl border border-lp-line bg-lp-line md:grid-cols-3">
          {STEPS.map((s) => (
            <li
              key={s.n}
              className="group relative bg-lp-bg p-8 transition-colors hover:bg-[#0e130c] md:p-10"
            >
              <span
                className="lp-display block text-[7rem] leading-none text-transparent transition-all duration-500 [-webkit-text-stroke:1px_rgb(238_241_230/0.25)] group-hover:[-webkit-text-stroke:1px_#d3f08a]"
                aria-hidden="true"
              >
                {s.n}
              </span>
              <h3 className="mt-8 text-xl font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-lp-mute">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
