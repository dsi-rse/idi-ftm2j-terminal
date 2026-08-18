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

/**
 * Narrows whatever a caller hands the store to exactly the fields that get
 * persisted.
 *
 * Callers pass search results, which carry more than this type declares —
 * `CompanySearchResultItem` adds the company's full subsidiary list, up to 1,284
 * names. TypeScript permits that (excess-property checks do not apply to a
 * variable passed as an argument) and the extra field would then be written
 * straight to IndexedDB, where nothing ever reads it: neither the Recent nor the
 * Saved tab consults the search query.
 *
 * So the boundary is enforced here, once, rather than trusted to every call
 * site. Persisted records stay small no matter what gets handed in.
 */
function toSearchMeta(company: CompanySearchMeta): CompanySearchMeta {
  return {
    permId: company.permId,
    companyName: company.companyName,
    sector: company.sector,
    country: company.country,
    tickers: company.tickers,
  };
}

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
            : { bookmarked: [...state.bookmarked, toSearchMeta(company)] },
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
            { ...toSearchMeta(company), viewedAt: Date.now() },
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
      // Open by default: the search rail is part of the terminal layout, not
      // an occasional overlay. Below `md` this renders as a full-screen sheet
      // — see the mobile-scope issue noted on the design-parity epic.
      isInspectorOpen: true,
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
