import { useEffect, useState } from "react";
import { fetchRecipes } from "./api/recipesApi";

// One request per page load, shared by the header menu, home page and list.
let cache = null;
let pending = null;

function load() {
  if (cache) return Promise.resolve(cache);
  if (!pending) {
    pending = fetchRecipes()
      .then((list) => (cache = list))
      .catch(() => [])
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/** { recipes, isLoading } - an empty list means "hide everything recipe-related". */
export function useRecipes() {
  const [recipes, setRecipes] = useState(cache || []);
  const [isLoading, setIsLoading] = useState(!cache);
  useEffect(() => {
    let alive = true;
    load().then((list) => {
      if (!alive) return;
      setRecipes(list);
      setIsLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);
  return { recipes, isLoading };
}
