import Image from "next/image";

/** Dev Trace logo mark. Sized by its parent tile; decorative because the brand name sits beside it. */
export function LogoMark() {
  return (
    <Image
      src="/assets/devtracelogo.svg"
      alt=""
      width={64}
      height={64}
      loading="eager"
      className="h-full w-full object-contain"
    />
  );
}
