import apiClient from "../../../lib/apiClient";

/** Published recipe cards. */
export async function fetchRecipes() {
  const { data } = await apiClient.get("/recipes");
  return data.data.recipes || [];
}

export async function fetchRecipe(slug) {
  const { data } = await apiClient.get(`/recipes/${encodeURIComponent(slug)}`);
  return data.data.recipe;
}
