import type { Metadata } from "next";
import { DemoApp } from "./DemoApp";

export const metadata: Metadata = {
  title: "Live demo — Burrow",
  description:
    "Explore a fully seeded, interactive Burrow workspace. No sign-in required.",
};

export default function DemoPage() {
  return <DemoApp />;
}
