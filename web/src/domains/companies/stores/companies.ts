import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import {
  createJSONStorage,
  persist,
  type StateStorage,
} from "zustand/middleware";

const MAX_RECENTLY_VIEWED = 20;

export type CompanySearchMeta = {
  permId: string;
  companyName: string;
  sector?: string;
  country?: string;
  tickers?: string[];
};

export type RecentlyViewedEntry = CompanySearchMeta & {
  viewedAt: number;
};

export type CompanyTab = "all" | "recent" | "saved";

const idbStorage: StateStorage = {
  getItem: async (name) => (await get(name)) ?? null,
  setItem: async (name, value) => {
    await set(name, value);
  },
  removeItem: async (name) => {
    await del(name);
  },
};

type CompaniesState = {
  bookmarked: CompanySearchMeta[];
  recentlyViewed: RecentlyViewedEntry[];
  addBookmark: (company: CompanySearchMeta) => void;
  removeBookmark: (permId: string) => void;
  isBookmarked: (permId: string) => boolean;
  addRecentlyViewed: (company: CompanySearchMeta) => void;
  removeRecentlyViewed: (permId: string) => void;
  isRecentlyViewed: (permId: string) => boolean;

  searchQuery: string;
  activeTab: CompanyTab;
  allPage: number;
  recentPage: number;
  savedPage: number;
  isInspectorOpen: boolean;
  setSearchQuery: (q: string) => void;
  setActiveTab: (t: CompanyTab) => void;
  setPage: (tab: CompanyTab, page: number) => void;
  setInspectorOpen: (open: boolean) => void;
};

export const useCompaniesStore = create<CompaniesState>()(
  persist(
    (set, get) => ({
      bookmarked: [],
      recentlyViewed: [],

      addBookmark: (company) =>
        set((state) =>
          state.bookmarked.some((c) => c.permId === company.permId)
            ? state
            : { bookmarked: [...state.bookmarked, company] },
        ),

      removeBookmark: (permId) =>
        set((state) => ({
          bookmarked: state.bookmarked.filter((c) => c.permId !== permId),
        })),

      isBookmarked: (permId) =>
        get().bookmarked.some((c) => c.permId === permId),

      addRecentlyViewed: (company) =>
        set((state) => ({
          recentlyViewed: [
            { ...company, viewedAt: Date.now() },
            ...state.recentlyViewed.filter((c) => c.permId !== company.permId),
          ].slice(0, MAX_RECENTLY_VIEWED),
        })),

      removeRecentlyViewed: (permId) =>
        set((state) => ({
          recentlyViewed: state.recentlyViewed.filter(
            (c) => c.permId !== permId,
          ),
        })),

      isRecentlyViewed: (permId) =>
        get().recentlyViewed.some((c) => c.permId === permId),

      searchQuery: "",
      activeTab: "all",
      allPage: 1,
      recentPage: 1,
      savedPage: 1,
      isInspectorOpen: false,
      setSearchQuery: (q) => set({ searchQuery: q, allPage: 1 }),
      setActiveTab: (t) => set({ activeTab: t }),
      setPage: (tab, page) =>
        set(
          tab === "all"
            ? { allPage: page }
            : tab === "recent"
              ? { recentPage: page }
              : { savedPage: page },
        ),
      setInspectorOpen: (open) => set({ isInspectorOpen: open }),
    }),
    {
      name: "companies-store",
      version: 3,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        bookmarked: s.bookmarked,
        recentlyViewed: s.recentlyViewed,
      }),
      migrate: (persisted, version) => {
        if (version < 3) {
          return { bookmarked: [], recentlyViewed: [] };
        }
        return persisted as { bookmarked: []; recentlyViewed: [] };
      },
    },
  ),
);
