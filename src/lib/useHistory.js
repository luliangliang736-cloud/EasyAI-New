"use client";

import { useState, useCallback, useRef } from "react";

const MAX_HISTORY = 50;

export function useHistory(initial) {
  const [state, setState] = useState(initial);
  const pastRef = useRef([]);
  const futureRef = useRef([]);

  const push = useCallback((newState) => {
    setState((prev) => {
      pastRef.current = [...pastRef.current, prev].slice(-MAX_HISTORY);
      futureRef.current = [];
      return typeof newState === "function" ? newState(prev) : newState;
    });
  }, []);

  const undo = useCallback(() => {
    setState((prev) => {
      if (pastRef.current.length === 0) return prev;
      const previous = pastRef.current[pastRef.current.length - 1];
      pastRef.current = pastRef.current.slice(0, -1);
      futureRef.current = [prev, ...futureRef.current];
      return previous;
    });
  }, []);

  const redo = useCallback(() => {
    setState((prev) => {
      if (futureRef.current.length === 0) return prev;
      const next = futureRef.current[0];
      futureRef.current = futureRef.current.slice(1);
      pastRef.current = [...pastRef.current, prev];
      return next;
    });
  }, []);

  const canUndo = pastRef.current.length > 0;
  const canRedo = futureRef.current.length > 0;

  return { state, push, undo, redo, canUndo, canRedo, setState };
}
