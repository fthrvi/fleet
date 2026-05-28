"use client";
import { createContext, useContext } from "react";

export interface FocusCtx { focusedId: string | null; setFocused: (id: string | null) => void; }
export const FocusContext = createContext<FocusCtx>({ focusedId: null, setFocused: () => {} });
export const useFocus = () => useContext(FocusContext);
