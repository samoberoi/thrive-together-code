import { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart, MessageCircle, Users, Send, Plus,
  Loader2, Trash2, Trophy, Flame, TrendingDown, TrendingUp, X, Sparkles,
  Footprints, Utensils, Award, Activity, Wind, Scale, HeartPulse, Star,
  ImagePlus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { LoadingState, EmptyState } from "@/components/shared";

// Map category slug → flat lucide icon so wins/steps/movement/etc. stay visually consistent
const CATEGORY_ICON: Record<string, LucideIcon> = {
  wins: Trophy,
  weight: Scale,
  weight_loss: TrendingDown,
  sugar: Activity,
  streak: Flame,
  meals: Utensils,
  movement: Footprints,
  steps: Footprints,
  yoga: Wind,
  exercise: Award,
  health_score: HeartPulse,
  community: Users,
  default: Star,
};

const iconFor = (slug?: string | null): LucideIcon =>
  (slug && CATEGORY_ICON[slug]) || CATEGORY_ICON.default;

import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useSearchParams } from "react-router-dom";
import {
  fetchPosts, createPost, deletePost, fetchComments, addComment,
  toggleLike, fetchUserLikes, fetchPostCategories, uploadCommunityImage,
  fetchPostLikers,
  type CommunityPost, type CommunityComment, type PostCategory, type PostLiker,
} from "@/lib/communityService";
import { supabase } from "@/integrations/supabase/client";
import { fetchCommunityMemberCount } from "@/lib/communityService";
import { formatDistanceToNow } from "date-fns";

const EASE = [0.22, 1, 0.36, 1] as const;

function getPostTag(postType: string, achievementData: any) {
  if (postType === "achievement" && achievementData) {
    switch (achievementData.type) {
      case "weight": return { label: "Weight Win", icon: TrendingDown };
      case "sugar": return { label: "Sugar Control", icon: TrendingDown };
      case "health_score": return { label: "Score Up", icon: TrendingUp };
      case "streak": return { label: "Streak", icon: Flame };
    }
  }
  if (postType === "milestone") return { label: "Milestone", icon: Trophy };
  return null;
}

function PostCard({
  post, category, isLiked, currentUserId, canDelete,
  onToggleLike, onDelete,
}: {
  post: CommunityPost; category?: PostCategory; isLiked: boolean; currentUserId: string;
  canDelete: boolean;
  onToggleLike: (id: string) => void; onDelete: (id: string) => void;
}) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommunityComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [loadingComments, setLoadingComments] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localLiked, setLocalLiked] = useState(isLiked);
  const [localLikeCount, setLocalLikeCount] = useState(post.like_count || 0);
  const [likeBusy, setLikeBusy] = useState(false);
  const [likersPreview, setLikersPreview] = useState<PostLiker[]>([]);
  const [showLikers, setShowLikers] = useState(false);
  const [allLikers, setAllLikers] = useState<PostLiker[] | null>(null);
  const [localCommentCount, setLocalCommentCount] = useState(post.comment_count);

  // Sync when parent state changes (e.g. after refetch)
  useEffect(() => { setLocalLiked(isLiked); }, [isLiked]);
  useEffect(() => { setLocalLikeCount(post.like_count || 0); }, [post.like_count]);

  // Load a small preview of likers so we can show "Liked by Ravi and 4 others"
  useEffect(() => {
    let alive = true;
    (async () => {
      const list = await fetchPostLikers(post.id, 3);
      if (alive) setLikersPreview(list);
    })();
    return () => { alive = false; };
  }, [post.id, localLikeCount]);

  const loadComments = useCallback(async () => {
    setLoadingComments(true);
    const data = await fetchComments(post.id);
    setComments(data);
    setLocalCommentCount(data.length);
    setLoadingComments(false);
  }, [post.id]);

  const handleToggleComments = () => {
    if (!showComments) loadComments();
    setShowComments(!showComments);
  };

  const handleLike = async () => {
    if (likeBusy) return;
    setLikeBusy(true);
    const nextLiked = !localLiked;
    // Optimistic: flip and clamp
    setLocalLiked(nextLiked);
    setLocalLikeCount((c) => Math.max(0, c + (nextLiked ? 1 : -1)));
    try {
      await onToggleLike(post.id);
    } finally {
      setLikeBusy(false);
    }
  };

  const openLikers = async () => {
    if (localLikeCount === 0) return;
    setShowLikers(true);
    if (allLikers === null) {
      const list = await fetchPostLikers(post.id, 100);
      setAllLikers(list);
    }
  };

  const handleSubmitComment = async () => {
    if (!commentText.trim()) return;
    setSubmitting(true);
    const ok = await addComment(post.id, currentUserId, commentText.trim());
    if (ok) {
      setCommentText("");
      await loadComments();
    }
    setSubmitting(false);
  };

  const tagInfo = getPostTag(post.post_type, post.achievement_data);
  const timeAgo = formatDistanceToNow(new Date(post.created_at), { addSuffix: true });

  // Instagram-style "Liked by …" line
  const likedByLine = (() => {
    if (localLikeCount === 0 || likersPreview.length === 0) return null;
    const first = likersPreview[0];
    const rest = Math.max(0, localLikeCount - 1);
    return (
      <button
        type="button"
        onClick={openLikers}
        className="mt-2 flex items-center gap-2 text-left"
      >
        <div className="flex -space-x-1.5">
          {likersPreview.slice(0, 3).map((l) => (
            <div key={l.user_id} className="w-5 h-5 rounded-full ring-2 ring-card bg-muted overflow-hidden flex items-center justify-center">
              {l.avatar_url
                ? <img loading="lazy" decoding="async" src={l.avatar_url} alt="" className="w-full h-full object-cover" />
                : <span className="text-[9px] font-bold text-foreground">{(l.name || "?")[0]}</span>}
            </div>
          ))}
        </div>
        <span className="text-xs text-muted-foreground truncate">
          Liked by <span className="font-semibold text-foreground">{first.name}</span>
          {rest > 0 && <> and <span className="font-semibold text-foreground">{rest} other{rest === 1 ? "" : "s"}</span></>}
        </span>
      </button>
    );
  })();

  const likersSheet = typeof document === "undefined" ? null : createPortal(
    <AnimatePresence>
      {showLikers && (
        <motion.div
          className="fixed inset-0 z-[10000] flex items-end justify-center bg-foreground/30 backdrop-blur-sm"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={() => setShowLikers(false)}
        >
          <motion.div
            className="relative w-full sm:max-w-md bg-card rounded-t-3xl sm:rounded-3xl border border-border shadow-2xl max-h-[min(74dvh,620px)] flex flex-col overflow-hidden"
            initial={{ y: 56 }} animate={{ y: 0 }} exit={{ y: 56 }}
            transition={{ duration: 0.22, ease: EASE }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-border/60 flex-shrink-0">
              <p className="font-black text-lg text-foreground">Likes</p>
              <button
                type="button"
                onClick={() => setShowLikers(false)}
                aria-label="Close likes"
                className="w-10 h-10 rounded-full bg-muted text-muted-foreground flex items-center justify-center flex-shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 py-3"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
            >
              {allLikers === null ? (
                <div className="min-h-32 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
              ) : allLikers.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">No likes yet</p>
              ) : (
                <ul className="space-y-1">
                  {allLikers.map((l) => (
                    <li key={l.user_id} className="flex items-center gap-3 rounded-2xl px-1 py-3">
                      <div className="w-11 h-11 rounded-full bg-muted overflow-hidden flex items-center justify-center flex-shrink-0 ring-1 ring-border/60">
                        {l.avatar_url
                          ? <img loading="lazy" decoding="async" src={l.avatar_url} alt="" className="w-full h-full object-cover" />
                          : <span className="text-sm font-black text-foreground">{(l.name || "?")[0]}</span>}
                      </div>
                      <span className="min-w-0 flex-1 text-[15px] font-bold text-foreground truncate">{l.name}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );

  return (
    <motion.div
      className="bg-card rounded-3xl p-5 border border-border/60"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE }}
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden ring-2 ring-[var(--bbdo-blue)]/15">
          {post.user_avatar ? (
            <img loading="lazy" decoding="async" src={post.user_avatar} alt="" className="w-full h-full object-cover" />
          ) : (
            <span className="text-foreground font-bold text-sm">{(post.user_name || "?")[0]}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-foreground font-bold text-sm truncate">{post.user_name}</p>
          <p className="text-muted-foreground text-[11px]">{timeAgo}</p>
          {category && (() => {
            const CatIcon = iconFor(category.slug);
            return (
              <span
                className="mt-1.5 inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ background: `${category.accent_color}15`, color: category.accent_color }}
              >
                <CatIcon className="w-3 h-3 shrink-0" strokeWidth={2} />
                <span className="truncate">{category.label}</span>
              </span>
            );
          })()}
        </div>
        {canDelete && (
          <button onClick={() => onDelete(post.id)} className="text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="w-4 h-4" strokeWidth={1.5} />
          </button>
        )}
      </div>

      <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">{post.content}</p>

      {post.image_url && (
        <img src={post.image_url} alt="" loading="lazy" decoding="async" className="w-full rounded-2xl object-cover max-h-80 mt-3" />
      )}

      {tagInfo && (
        <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--bbdo-blue)]/8 text-[var(--bbdo-blue)]">
          <tagInfo.icon className="w-3.5 h-3.5" strokeWidth={2} />
          <span className="text-xs font-bold">{tagInfo.label}</span>
        </div>
      )}

      <div className="flex items-center gap-5 mt-4 pt-3 border-t border-border/60">
        <motion.button onClick={handleLike} disabled={likeBusy} className="flex items-center gap-1.5 disabled:opacity-70" whileTap={{ scale: 0.96 }}
          transition={{ duration: 0.12, ease: EASE }}>
          <Heart className={`w-5 h-5 transition-colors ${localLiked ? "text-[var(--bbdo-red)] fill-[var(--bbdo-red)]" : "text-muted-foreground"}`} strokeWidth={1.6} />
          <span className={`text-sm font-semibold ${localLiked ? "text-[var(--bbdo-red)]" : "text-muted-foreground"}`}>{localLikeCount}</span>
        </motion.button>
        <button className="flex items-center gap-1.5" onClick={handleToggleComments}>
          <MessageCircle className={`w-5 h-5 transition-colors ${showComments ? "text-[var(--bbdo-blue)]" : "text-muted-foreground"}`} strokeWidth={1.6} />
          <span className={`text-sm font-semibold ${showComments ? "text-[var(--bbdo-blue)]" : "text-muted-foreground"}`}>{localCommentCount}</span>
        </button>
      </div>

      {likedByLine}

      {likersSheet}


      <AnimatePresence>
        {showComments && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="mt-3 overflow-hidden">
            <div className="flex flex-col gap-3">
              {loadingComments ? (
                <div className="mx-auto"><LoadingState label="Loading replies…" /></div>
              ) : comments.length === 0 ? (
                <p className="text-muted-foreground text-xs text-center py-2">No replies yet — be first to encourage.</p>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="flex items-start gap-2">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {c.user_avatar ? (
                        <img loading="lazy" decoding="async" src={c.user_avatar} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-foreground text-[10px] font-bold">{(c.user_name || "?")[0]}</span>
                      )}
                    </div>
                    <div className="bg-muted/60 rounded-2xl px-3 py-2 flex-1">
                      <p className="text-foreground text-xs font-bold">{c.user_name}</p>
                      <p className="text-foreground/80 text-xs mt-0.5">{c.content}</p>
                    </div>
                  </div>
                ))
              )}
              <div className="flex items-center gap-2 mt-1">
                <input
                  className="flex-1 bg-muted/60 rounded-full px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-[var(--bbdo-blue)]/30"
                  placeholder="Write a reply…"
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSubmitComment()}
                />
                <button
                  onClick={handleSubmitComment}
                  disabled={submitting || !commentText.trim()}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50 text-white"
                  style={{ background: "var(--bbdo-gradient)" }}
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" strokeWidth={1.6} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function CreatePostSheet({
  onClose, onPost, initialContent, categories, initialCategorySlug, userId, initialImageUrl,
}: {
  onClose: () => void;
  onPost: (content: string, categorySlug: string | null, imageUrl: string | null) => Promise<void>;
  initialContent?: string;
  initialImageUrl?: string | null;
  categories: PostCategory[];
  initialCategorySlug?: string | null;
  userId: string;
}) {
  const [content, setContent] = useState(initialContent || "");
  const [posting, setPosting] = useState(false);
  const [slug, setSlug] = useState<string | null>(initialCategorySlug ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialImageUrl ?? null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Only images", description: "Please pick a JPG, PNG or WEBP", variant: "destructive" });
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Please choose an image under 8 MB", variant: "destructive" });
      return;
    }
    const localUrl = URL.createObjectURL(file);
    setPreviewUrl(localUrl);
    setUploading(true);
    const url = await uploadCommunityImage(userId, file);
    setUploading(false);
    if (!url) {
      setPreviewUrl(null);
      toast({ title: "Upload failed", description: "Try again in a moment", variant: "destructive" });
      return;
    }
    setImageUrl(url);
  };

  const handlePost = async () => {
    if (!content.trim() && !imageUrl) return;
    setPosting(true);
    await onPost(content.trim(), slug, imageUrl);
    setPosting(false);
    onClose();
  };

  return (
    <motion.div className="fixed inset-0 z-[60] flex items-end justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg bg-card rounded-t-3xl p-5 max-h-[88dvh] overflow-y-auto"
        style={{ paddingBottom: "calc(var(--kb-h, 0px) + var(--nav-clear, calc(env(safe-area-inset-bottom, 0px) + 6rem)))" }}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-foreground font-black text-lg">Share with the community</h3>
          <button onClick={onClose}><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>
        <textarea
          className="w-full bg-muted/40 border border-border rounded-2xl p-4 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-[var(--bbdo-blue)]/30 min-h-[120px]"
          placeholder="Steps you took today, a win, a meal, a question…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />

        {/* Image preview */}
        {previewUrl && (
          <div className="relative mt-3 rounded-2xl overflow-hidden border border-border">
            <img loading="lazy" decoding="async" src={previewUrl} alt="" className="w-full max-h-72 object-cover" />
            {uploading && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
            <button
              type="button"
              onClick={() => { setPreviewUrl(null); setImageUrl(null); }}
              className="absolute top-2 right-2 rounded-full bg-black/60 text-white p-1.5 hover:bg-black/80"
              aria-label="Remove image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Add photo trigger */}
        {!previewUrl && (
          <label className="mt-3 inline-flex items-center gap-2 cursor-pointer rounded-full bg-primary/10 hover:bg-primary/15 text-primary px-3 py-1.5 text-xs font-bold transition-colors">
            <ImagePlus className="w-4 h-4" strokeWidth={2.25} />
            Add a photo
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </label>
        )}

        {categories.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Category</p>
              {slug && (
                <button type="button" onClick={() => setSlug(null)} className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground underline">
                  Clear
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {categories.map((c) => {
                const active = slug === c.slug;
                const CatIcon = iconFor(c.slug);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSlug(active ? null : c.slug)}
                    className="flex items-center gap-2 rounded-2xl border px-3 py-2.5 text-left text-xs font-bold transition-all"
                    style={{
                      background: active ? c.accent_color : `${c.accent_color}0F`,
                      color: active ? "#fff" : c.accent_color,
                      borderColor: active ? c.accent_color : `${c.accent_color}33`,
                      boxShadow: active ? `0 6px 16px -8px ${c.accent_color}` : "none",
                    }}
                  >
                    <span
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                      style={{ background: active ? "rgba(255,255,255,0.22)" : `${c.accent_color}1F` }}
                    >
                      {active ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <CatIcon className="h-3.5 w-3.5" strokeWidth={2} />}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-3 rounded-2xl bg-muted text-foreground font-bold text-sm">Cancel</button>
          <button
            onClick={handlePost}
            disabled={posting || uploading || (!content.trim() && !imageUrl)}
            className="flex-1 py-3 rounded-2xl text-white font-bold text-sm disabled:opacity-50"
            style={{ background: "var(--bbdo-gradient)" }}
          >
            {posting ? "Posting…" : uploading ? "Uploading…" : "Post"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Community() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [prefillContent, setPrefillContent] = useState("");
  const [prefillSlug, setPrefillSlug] = useState<string | null>(null);
  const [prefillImage, setPrefillImage] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [categories, setCategories] = useState<PostCategory[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coachPatientIds, setCoachPatientIds] = useState<Set<string>>(new Set());

  const categoryMap = useMemo(() => {
    const m = new Map<string, PostCategory>();
    categories.forEach((c) => m.set(c.slug, c));
    return m;
  }, [categories]);

  // Handle deep-link share (metric is optional — goal shares have none)
  useEffect(() => {
    const shareType = searchParams.get("share");
    const metric = searchParams.get("metric");
    if (shareType) {
      const m = metric ? metric : "";
      const messages: Record<string, { msg: string; slug: string }> = {
        weight_loss: { msg: `🔥 Just dropped ${m}! My discipline is paying off. #ByeByeDiabetes`, slug: "wins" },
        weight: { msg: `🔥 Just dropped ${m}! My discipline is paying off. #ByeByeDiabetes`, slug: "wins" },
        sugar_drop: { msg: `🍃 My sugar improved — ${m}! Feeling the change. #SugarControl`, slug: "wins" },
        sugar: { msg: `🍃 My sugar improved — ${m}! Feeling the change. #SugarControl`, slug: "wins" },
        bp_improvement: { msg: `❤️ BP getting better — ${m}! #HealthWin`, slug: "wins" },
        health_score: { msg: `🏆 Health score improved by ${m}! Feeling stronger.`, slug: "wins" },
        exercise_goal: { msg: `💪 Hit my exercise goal today! Showing up beats perfect. #ByeByeDiabetes`, slug: "wins" },
        yoga_goal: { msg: `🧘 Finished my yoga session today — calmer body, calmer mind. #ByeByeDiabetes`, slug: "wins" },
        movement_goal: { msg: `🚶 Crushed my movement goal today! Every step counts. #ByeByeDiabetes`, slug: "wins" },
        generic: { msg: `🏆 Another win logged today on my reversal journey! #ByeByeDiabetes`, slug: "wins" },
      };
      const preset =
        messages[shareType] ||
        (m ? { msg: `🏆 Health win: ${m}!`, slug: "wins" } : messages.generic);
      setPrefillContent(preset.msg);
      setPrefillSlug(preset.slug);
      setPrefillImage(searchParams.get("img"));
      setShowCreate(true);
      const next = new URLSearchParams(searchParams);
      next.set("tab", "community");
      next.delete("share");
      next.delete("metric");
      next.delete("img");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);


  const loadCategories = useCallback(async () => {
    const cats = await fetchPostCategories();
    setCategories(cats);
  }, []);

  const loadFeed = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const data = await fetchPosts(50, activeSlug);
    setPosts(data);
    const likes = await fetchUserLikes(user.id, data.map((p) => p.id));
    setLikedPosts(likes);
    setLoading(false);
  }, [user, activeSlug]);

  useEffect(() => { loadCategories(); }, [loadCategories]);
  useEffect(() => { loadFeed(); }, [loadFeed]);

  useEffect(() => {
    // Cached, security-definer count — avoids a full row-level scan of the
    // member list every time the feed mounts.
    void fetchCommunityMemberCount().then(setMemberCount);
  }, []);

  // Load current user's role + (if coach) assigned patient ids for delete-permission UI
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const [{ data: roles }, { data: coachRows }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("coaches").select("id").eq("user_id", user.id),
      ]);
      if (cancelled) return;
      const roleSet = new Set((roles || []).map((r: any) => r.role));
      setIsAdmin(roleSet.has("admin"));
      const coachIds = (coachRows || []).map((c: any) => c.id);
      if (coachIds.length > 0) {
        const { data: assigns } = await supabase
          .from("coach_assignments")
          .select("user_id")
          .in("coach_id", coachIds)
          .eq("is_active", true);
        if (cancelled) return;
        setCoachPatientIds(new Set((assigns || []).map((a: any) => a.user_id)));
      } else {
        setCoachPatientIds(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel("community-feed")
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "community_posts" }, () => loadFeed())
      .on("postgres_changes" as any, { event: "DELETE", schema: "public", table: "community_posts" }, () => loadFeed())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadFeed]);

  const handlePost = async (content: string, categorySlug: string | null, imageUrl: string | null) => {
    if (!user) return;
    const ok = await createPost(user.id, content, "manual", null, imageUrl || undefined, categorySlug);
    if (ok) {
      toast({ title: "Posted!", description: "Your post is live in the community" });
      setPrefillContent("");
      setPrefillSlug(null);
      loadFeed();
    }
  };

  const handleToggleLike = async (postId: string) => {
    if (!user) return;
    const liked = await toggleLike(postId, user.id);
    setLikedPosts((prev) => {
      const next = new Set(prev);
      if (liked) next.add(postId); else next.delete(postId);
      return next;
    });
  };

  const handleDelete = async (postId: string) => {
    const ok = await deletePost(postId);
    if (ok) {
      toast({ title: "Post deleted" });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    }
  };

  const firstName = user?.email?.split("@")[0] || "you";

  return (
    <div className="flex flex-col gap-5 px-5 pt-4 pb-32 max-w-2xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--bbdo-blue)]">Community</p>
        <h1 className="text-3xl font-black text-foreground mt-1 leading-tight">Today's wins, together.</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {memberCount > 0 ? (
            <><span className="font-bold text-foreground">{memberCount.toLocaleString()}</span> members showing up. Share your steps, badges, meals — anything.</>
          ) : (
            "Share steps, badges, meals — anything."
          )}
        </p>
      </motion.div>

      {/* Composer */}
      <motion.button
        onClick={() => setShowCreate(true)}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: EASE, delay: 0.04 }}
        whileTap={{ scale: 0.985 }}
        className="liquid-glass rounded-3xl p-4 flex items-center gap-3 text-left hover:border-[var(--bbdo-blue)]/40 transition-colors"
      >
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white" style={{ background: "var(--bbdo-gradient)" }}>
          <Plus className="w-4 h-4" strokeWidth={2.4} />
        </div>
        <span className="text-muted-foreground text-sm">Share your morning win, {firstName}…</span>
        <Sparkles className="w-4 h-4 text-[var(--bbdo-red)] ml-auto" />
      </motion.button>

      {/* Category chips */}
      {categories.length > 0 && (
        <div className="-mx-5 px-5 overflow-x-auto no-scrollbar">
          <div className="flex gap-2 min-w-max">
            <CategoryChip
              active={activeSlug === null}
              onClick={() => setActiveSlug(null)}
              label="All"
              icon={Sparkles}
              color="#0F1A3D"
            />
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                active={activeSlug === c.slug}
                onClick={() => setActiveSlug(c.slug)}
                label={c.label}
                icon={iconFor(c.slug)}
                color={c.accent_color}
              />
            ))}
          </div>
        </div>
      )}

      {/* Feed */}
      {loading ? (
        <LoadingState variant="card" />
      ) : posts.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Nothing here yet"
          description={activeSlug ? "Be the first to post in this category." : "Share your first win and start the conversation."}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {posts.map((post, i) => (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: EASE, delay: Math.min(i, 6) * 0.04 }}
            >
              <PostCard
                post={post}
                category={post.category_slug ? categoryMap.get(post.category_slug) : undefined}
                isLiked={likedPosts.has(post.id)}
                currentUserId={user?.id || ""}
                canDelete={
                  post.user_id === user?.id ||
                  isAdmin ||
                  coachPatientIds.has(post.user_id)
                }
                onToggleLike={handleToggleLike}
                onDelete={handleDelete}
              />
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showCreate && user && (
          <CreatePostSheet
            onClose={() => { setShowCreate(false); setPrefillContent(""); setPrefillSlug(null); setPrefillImage(null); }}
            onPost={handlePost}
            initialContent={prefillContent}
            initialCategorySlug={prefillSlug ?? activeSlug}
            initialImageUrl={prefillImage}
            categories={categories}
            userId={user.id}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CategoryChip({
  active, onClick, label, icon: Icon, color,
}: { active: boolean; onClick: () => void; label: string; icon: LucideIcon; color: string }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      transition={{ duration: 0.12, ease: EASE }}
      className="inline-flex shrink-0 items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all"
      style={{
        background: active ? color : "transparent",
        color: active ? "#fff" : color,
        border: `1.5px solid ${active ? color : `${color}40`}`,
        minWidth: "max-content",
      }}
    >
      <Icon className="w-3.5 h-3.5" strokeWidth={2} />
      {label}
    </motion.button>
  );
}
