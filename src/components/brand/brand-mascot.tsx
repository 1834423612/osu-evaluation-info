import Image from "next/image";
import { brand, type MascotExpression } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandMascot({
  portrait = false,
  size = 112,
  className,
  eager = false,
  expression = "thinking",
}: {
  portrait?: boolean;
  size?: number;
  className?: string;
  eager?: boolean;
  expression?: MascotExpression;
}) {
  return (
    <Image
      src={
        portrait
          ? brand.assets.portrait
          : expression === "thinking"
            ? brand.assets.mascot
            : brand.assets.expressions[expression]
      }
      alt=""
      width={size}
      height={size}
      className={cn("brand-mascot", className)}
      data-mascot-expression={portrait ? "portrait" : expression}
      data-debug-logo={portrait ? "" : undefined}
      loading={eager ? "eager" : "lazy"}
      unoptimized
    />
  );
}
