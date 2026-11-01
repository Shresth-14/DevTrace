export function ProblemSection() {
  return (
    <section className="lp-reveal px-6 py-28 sm:px-8 md:py-44">
      <div className="mx-auto max-w-5xl text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-lp-mute">
          The problem
        </p>
        <h2 className="mt-8 text-[clamp(2rem,5.5vw,4.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
          The code stays. The reasons{" "}
          <span className="lp-display text-lp-glow">disappear into old threads.</span>
        </h2>
        <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-lp-mute sm:text-lg">
          Months later, nobody remembers why the team chose one approach and dropped another.
          The argument is still on GitHub, scattered across issues, reviews and comments.
        </p>
      </div>
    </section>
  );
}
