import React from "react";
import { useCachedState } from "@shades/common/app";
import {
  message as messageUtils,
  object as objectUtils,
} from "@shades/common/utils";

const { omitKey } = objectUtils;
const { createEmptyParagraphElement } = messageUtils;

const CACHE_KEY = "channel-drafts";

const createEmptyItem = () => ({
  id: String(Date.now()),
  name: "",
  body: [createEmptyParagraphElement()],
});

const createCollectionHook = (cacheKey) => () => {
  const [entriesById, setEntries] = useCachedState(cacheKey);
  const items = entriesById == null ? [] : Object.values(entriesById);

  const createItem = React.useCallback(async () => {
    const item = createEmptyItem();
    await setEntries((entriesById) => ({
      ...entriesById,
      [item.id]: item,
    }));
    return item;
  }, [setEntries]);

  const deleteItem = React.useCallback(
    (id) => setEntries((entriesById) => omitKey(id, entriesById)),
    [setEntries]
  );

  return { items, createItem, deleteItem };
};

const createSingleItemHook = (cacheKey) => (id) => {
  const [entriesById, setEntries] = useCachedState(cacheKey);
  const item = entriesById == null ? null : entriesById[id];

  const setName = React.useCallback(
    (name) =>
      setEntries((entriesById) => {
        const item = entriesById[id];
        return { ...entriesById, [item.id]: { ...item, name } };
      }),
    [id, setEntries]
  );

  const setBody = React.useCallback(
    (body) =>
      setEntries((entriesById) => {
        const item = entriesById[id];
        return { ...entriesById, [item.id]: { ...item, body } };
      }),
    [id, setEntries]
  );

  return [item, { setName, setBody }];
};

export const useCollection = createCollectionHook(CACHE_KEY);

export const useSingleItem = createSingleItemHook(CACHE_KEY);