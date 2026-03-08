import { cn } from "@/lib/utils";
import { HTMLAttributes } from "react";

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("rounded-lg border border-slate-200 bg-white p-5 shadow-sm", props.className)} />;
}