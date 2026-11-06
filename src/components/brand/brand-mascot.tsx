import Image from "next/image";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandMascot({
  portrait = false,
  size = 112,
  className,
  eager = false,
}: {
  portrait?: boolean;
  size?: number;
  className?: string;
  eager?: boolean;
}) {
  return (
    <Image
      src={portrait ? brand.assets.portrait : brand.assets.mascot}
      alt=""
      width={size}
      height={size}
      className={cn("brand-mascot", className)}
      loading={eager ? "eager" : "lazy"}
      unoptimized
    />
  );
}
