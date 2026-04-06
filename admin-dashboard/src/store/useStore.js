import { useState } from "react";

export function useStore() {
  const [selectedRange, setSelectedRange] = useState("7d");
  return { selectedRange, setSelectedRange };
}
