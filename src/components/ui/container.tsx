import { HTMLAttributes } from "react";

export function Container({
  className = "",
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`mx-auto w-full max-w-5xl px-4 min-[340px]:px-6 sm:px-8 ${className}`}
      {...props}
    />
  );
}
