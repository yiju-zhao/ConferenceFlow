import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { webcrypto } from "node:crypto";
import { afterEach } from "vitest";

Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
afterEach(cleanup);
