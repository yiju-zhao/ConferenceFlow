import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

type MembershipSnapshot = {
  exists: () => boolean;
  data: () => unknown;
};

const authState = vi.hoisted(() => ({
  value: { user: { uid: "super-admin" }, isSuperAdmin: true },
}));
const firestoreState = vi.hoisted(() => ({
  memberPath: [] as string[],
  listener: null as ((snapshot: MembershipSnapshot) => void) | null,
}));

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => authState.value,
}));

vi.mock("../firebase", () => ({ db: {} }));

vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...path: string[]) => ({ path }),
  onSnapshot: (reference: { path: string[] }, listener: (snapshot: MembershipSnapshot) => void) => {
    firestoreState.memberPath = reference.path;
    firestoreState.listener = listener;
    return () => undefined;
  },
}));

import { useMembership } from "./useMembership";

beforeEach(() => {
  firestoreState.memberPath = [];
  firestoreState.listener = null;
});

it("keeps super-admin access while reflecting that admin's own focus document", () => {
  const { result } = renderHook(() => useMembership("conference-a"));

  expect(firestoreState.memberPath).toEqual([
    "conferences",
    "conference-a",
    "members",
    "super-admin",
  ]);

  act(() => {
    firestoreState.listener?.({
      exists: () => true,
      data: () => ({ aiFocus: "关注边缘部署" }),
    });
  });

  expect(result.current).toMatchObject({
    isAdmin: true,
    isApproved: true,
    membership: {
      id: "super-admin",
      role: "admin",
      status: "approved",
      aiFocus: "关注边缘部署",
    },
  });
});
