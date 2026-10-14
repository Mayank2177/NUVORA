"use client";

import { useEffect } from "react";
import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import { migrateLegacyAuthToken } from "@/lib/api";

export function AnimationProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => { migrateLegacyAuthToken(); }, []);
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>{children}</LazyMotion>
    </MotionConfig>
  );
}
