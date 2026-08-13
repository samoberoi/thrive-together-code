import { supabase } from "@/integrations/supabase/client";

export interface FoodItem {
  name: string;
  portion: string;
  calories: number;
}

export interface FoodAnalysis {
  food_items: FoodItem[];
  total_calories: number;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

export interface MealPhoto {
  id: string;
  user_id: string;
  fasting_tracking_id: string | null;
  meal_type: string;
  photo_url: string;
  estimated_calories: number | null;
  food_items: FoodItem[];
  logged_at: string;
  created_at: string;
}

/** Downscale + JPEG-compress a camera photo before upload (max 1280px, ~q0.8). */
async function compressPhoto(file: File): Promise<Blob> {
  try {
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => { URL.revokeObjectURL(url); resolve(el); };
      el.onerror = () => { URL.revokeObjectURL(url); reject(new Error("read failed")); };
      el.src = url;
    });
    const max = 1280;
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Upload a food photo to storage and return the public URL */
export async function uploadMealPhoto(
  userId: string,
  file: File,
  mealType: "fmod" | "lmod"
): Promise<string> {
  const blob = await compressPhoto(file);
  const isJpeg = blob !== file;
  const ext = isJpeg ? "jpg" : (file.name.split(".").pop() || "jpg");
  const path = `${userId}/${Date.now()}_${mealType}.${ext}`;

  const { error } = await supabase.storage
    .from("meal-photos")
    .upload(path, blob, { contentType: isJpeg ? "image/jpeg" : file.type, upsert: false, cacheControl: "31536000" });
  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from("meal-photos")
    .getPublicUrl(path);

  return urlData.publicUrl;
}


/** Convert a File to base64 string (without data URL prefix) */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:image/...;base64, prefix
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Call the AI edge function to analyze a food photo */
export async function analyzeFood(
  imageBase64: string,
  mealType: "fmod" | "lmod"
): Promise<FoodAnalysis> {
  const { data, error } = await supabase.functions.invoke("analyze-food", {
    body: { image_base64: imageBase64, meal_type: mealType },
  });
  if (error) throw error;
  if (data.error) throw new Error(data.error);
  return data as FoodAnalysis;
}

/** Save a meal photo record to the database */
export async function saveMealPhotoRecord(params: {
  userId: string;
  mealType: "fmod" | "lmod";
  photoUrl: string;
  estimatedCalories: number | null;
  foodItems: FoodItem[];
  fastingTrackingId?: string | null;
}): Promise<void> {
  const { error } = await supabase.from("meal_photos" as any).insert({
    user_id: params.userId,
    meal_type: params.mealType,
    photo_url: params.photoUrl,
    estimated_calories: params.estimatedCalories,
    food_items: params.foodItems,
    fasting_tracking_id: params.fastingTrackingId ?? null,
  } as any);
  if (error) throw error;
}

/** Fetch today's meal photos for a user */
export async function fetchTodayMealPhotos(userId: string): Promise<MealPhoto[]> {
  const today = new Date().toISOString().split("T")[0];
  const { data, error } = await supabase
    .from("meal_photos" as any)
    .select("*")
    .eq("user_id", userId)
    .gte("logged_at", `${today}T00:00:00`)
    .lt("logged_at", `${today}T23:59:59.999`)
    .order("logged_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as MealPhoto[];
}

/** Get total calories consumed today */
export async function getTodayCalories(userId: string): Promise<{
  total: number;
  meals: { type: string; calories: number; foodItems: FoodItem[] }[];
}> {
  const photos = await fetchTodayMealPhotos(userId);
  const meals = photos.map((p) => ({
    type: p.meal_type,
    calories: p.estimated_calories ?? 0,
    foodItems: (p.food_items ?? []) as FoodItem[],
  }));
  const total = meals.reduce((sum, m) => sum + m.calories, 0);
  return { total, meals };
}
