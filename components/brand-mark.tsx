export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/known-mark.png"
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0"
    />
  );
}
