import { clsx, type ClassValue } from "clsx"
import {twMerge, twJoin} from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function cj(...inputs: ClassValue[]) {
  return twJoin(clsx(inputs))
}
