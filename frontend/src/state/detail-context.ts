import {createContext} from "react";
import type {DetailStore} from "@/state/detail-store.tsx";

/**
 * This is by it's self to help with vite HMR causing undefined context
 */
export const DetailContext = createContext<DetailStore | null>(null);
