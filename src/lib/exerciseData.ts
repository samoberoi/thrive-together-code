// Curated BBDO yoga & pranayama video library.
// Each entry maps to a YouTube video with full clinical context.

import bhramariThumb from "@/assets/videos/bhramari.jpg";
import anulomVilomThumb from "@/assets/videos/anulom-vilom.jpg";
import chandraBhediThumb from "@/assets/videos/chandra-bhedi.jpg";
import bhujangasanaThumb from "@/assets/videos/bhujangasana.jpg";
import dhanurasanaThumb from "@/assets/videos/dhanurasana.jpg";
import jalandharBandhaThumb from "@/assets/videos/jalandhar-bandha.jpg";
import kapalbhatiThumb from "@/assets/videos/kapalbhati.jpg";
import legObliqueThumb from "@/assets/videos/leg-oblique.jpg";
import makarasanaThumb from "@/assets/videos/makarasana.jpg";
import mandukasanaThumb from "@/assets/videos/mandukasana.jpg";
import nadiShodhan1Thumb from "@/assets/videos/nadi-shodhan-1.jpg";
import nadiShodhan2Thumb from "@/assets/videos/nadi-shodhan-2.jpg";
import suryaBhediThumb from "@/assets/videos/surya-bhedi.jpg";
import trikonasanaThumb from "@/assets/videos/trikonasana.jpg";
import vakrasanaThumb from "@/assets/videos/vakrasana.jpg";

export type VideoGroup = "Pranayama" | "Yoga Asana" | "Bandha";

export type VideoTag =
  | "Stress"
  | "Diabetes"
  | "Thyroid"
  | "Digestion"
  | "Flexibility"
  | "Energy"
  | "Sleep & Calm"
  | "Focus"
  | "Weight Loss"
  | "Posture";

export type VideoIconName =
  | "Activity"
  | "Brain"
  | "CircleDot"
  | "Dumbbell"
  | "Flower2"
  | "Focus"
  | "Lock"
  | "Moon"
  | "Move3D"
  | "Sparkles"
  | "Sun"
  | "Target"
  | "Triangle"
  | "Wind";

export interface VideoEntry {
  id: string;
  name: string;
  category: string;          // raw category from sheet
  group: VideoGroup;         // normalised filter group
  tags: VideoTag[];
  suitableFor: string;
  notSuitableFor: string;
  dos: string;
  donts: string;
  benefits: string;
  youtubeId: string;
  youtubeUrl: string;
  icon: VideoIconName | string;
  thumbnail: string;
}

const yt = (id: string) => ({ youtubeId: id, youtubeUrl: `https://youtu.be/${id}` });

export const videos: VideoEntry[] = [
  {
    id: "bhramari",
    name: "Bhramari Pranayama",
    category: "Pranayama / Mind Relaxation",
    group: "Pranayama",
    tags: ["Stress", "Focus", "Sleep & Calm"],
    suitableFor: "Stress, anxiety, overthinking, students, professionals",
    notSuitableFor: "Severe ear infection, migraine during attacks, recent ear surgery",
    dos: "Sit calmly, close ears gently, inhale deeply, practice 5–6 rounds daily",
    donts: "Don’t press eyes hard, don’t force humming or breathing",
    benefits: "Relaxes mind, improves focus, activates brain cells",
    icon: "Brain",
    thumbnail: bhramariThumb,
    ...yt("SgKImCsfGjg"),
  },
  {
    id: "anulom-vilom",
    name: "Anulom Vilom Pranayama",
    category: "Breath Balancing Pranayama",
    group: "Pranayama",
    tags: ["Stress", "Focus", "Sleep & Calm"],
    suitableFor: "People seeking calmness, better breathing, mental balance",
    notSuitableFor: "Severe respiratory illness, uncontrolled high BP",
    dos: "Practice slow alternate breathing, maintain equal counts",
    donts: "Don’t force breath retention or breathe too fast",
    benefits: "Balances brain hemispheres, calms nervous system",
    icon: "CircleDot",
    thumbnail: anulomVilomThumb,
    ...yt("0Xi_BCbLRLs"),
  },
  {
    id: "chandra-bhedi",
    name: "Chandra Bhedi Pranayama",
    category: "Cooling Pranayama",
    group: "Pranayama",
    tags: ["Stress", "Sleep & Calm"],
    suitableFor: "High BP, anger issues, excess sweating, stress",
    notSuitableFor: "Low BP, sinus congestion, chronic cold",
    dos: "Inhale left, exhale right slowly, practice calmly",
    donts: "Don’t practice in very cold weather or force breathing",
    benefits: "Activates cooling energy, calms body and mind",
    icon: "Moon",
    thumbnail: chandraBhediThumb,
    ...yt("601EhWsZcXE"),
  },
  {
    id: "bhujangasana",
    name: "Bhujangasana (Cobra Pose)",
    category: "Backbend Yoga Asana",
    group: "Yoga Asana",
    tags: ["Flexibility", "Posture", "Thyroid"],
    suitableFor: "Beginners, posture improvement, spine flexibility seekers",
    notSuitableFor: "Pregnancy, slipped disc, severe back injury",
    dos: "Keep palms below shoulders, lift chest gently, stretch throat",
    donts: "Don’t overarch lower back or strain neck",
    benefits: "Improves spine flexibility, stretches thyroid area",
    icon: "Move3D",
    thumbnail: bhujangasanaThumb,
    ...yt("42FvgeEDpIw"),
  },
  {
    id: "dhanurasana",
    name: "Dhanurasana (Bow Pose)",
    category: "Spine & Digestive Yoga Pose",
    group: "Yoga Asana",
    tags: ["Digestion", "Flexibility", "Posture"],
    suitableFor: "People with stiffness, posture issues, mild digestive discomfort",
    notSuitableFor: "Pregnancy, hernia, severe back pain",
    dos: "Lift chest and thighs gradually, hold comfortably",
    donts: "Don’t force the pose or hold breath",
    benefits: "Improves flexibility, supports digestion, stretches chest",
    icon: "Target",
    thumbnail: dhanurasanaThumb,
    ...yt("TChTd3wzlgw"),
  },
  {
    id: "jalandhar-bandha",
    name: "Jalandhar Bandha",
    category: "Bandha / Thyroid Practice",
    group: "Bandha",
    tags: ["Thyroid", "Focus"],
    suitableFor: "Thyroid wellness seekers, pranayama practitioners",
    notSuitableFor: "Neck injury, cervical pain, vertigo",
    dos: "Keep spine straight, gently lower chin to chest",
    donts: "Don’t force chin downward or strain neck",
    benefits: "Stimulates thyroid gland, improves focus",
    icon: "Lock",
    thumbnail: jalandharBandhaThumb,
    ...yt("wOYUYlQaML8"),
  },
  {
    id: "kapalbhati",
    name: "Kapalbhati Pranayama",
    category: "Cleansing Pranayama",
    group: "Pranayama",
    tags: ["Energy", "Digestion", "Weight Loss"],
    suitableFor: "Healthy adults, yoga practitioners, breathing practice seekers",
    notSuitableFor: "High BP, heart clients, pregnancy, hernia",
    dos: "Exhale forcefully through nose, pull belly inward gently",
    donts: "Don’t practice aggressively or after meals",
    benefits: "Cleanses respiratory system, activates abdomen",
    icon: "Sparkles",
    thumbnail: kapalbhatiThumb,
    ...yt("K_KyoxdemOQ"),
  },
  {
    id: "leg-oblique",
    name: "Leg & Oblique Strengthening",
    category: "Yoga / Fat Burn Flow",
    group: "Yoga Asana",
    tags: ["Weight Loss", "Energy"],
    suitableFor: "People seeking leg strength, endurance, fat burn",
    notSuitableFor: "Severe knee pain, knee surgery, arthritis",
    dos: "Bend knees within comfort, engage core properly",
    donts: "Don’t sink too low or twist forcefully",
    benefits: "Strengthens legs, activates obliques, burns fat",
    icon: "Dumbbell",
    thumbnail: legObliqueThumb,
    ...yt("MBLFhmeNcG8"),
  },
  {
    id: "makarasana",
    name: "Makarasana",
    category: "Relaxation / Cervical Support Pose",
    group: "Yoga Asana",
    tags: ["Posture", "Sleep & Calm"],
    suitableFor: "Desk-job professionals, neck stiffness sufferers",
    notSuitableFor: "Severe neck injury, shoulder pain",
    dos: "Relax body fully, keep chin supported comfortably",
    donts: "Don’t strain neck upward",
    benefits: "Relaxes cervical area, improves neck flexibility",
    icon: "Activity",
    thumbnail: makarasanaThumb,
    ...yt("VrI1X7yfuGE"),
  },
  {
    id: "mandukasana",
    name: "Mandukasana",
    category: "Therapeutic Yoga / Diabetes Support",
    group: "Yoga Asana",
    tags: ["Diabetes", "Digestion"],
    suitableFor: "Diabetes management seekers, abdominal activation",
    notSuitableFor: "Pregnancy, hernia, abdominal surgery",
    dos: "Apply gentle abdominal pressure, hold comfortably",
    donts: "Don’t bend aggressively or overpress abdomen",
    benefits: "Stimulates abdominal organs, supports digestion",
    icon: "Flower2",
    thumbnail: mandukasanaThumb,
    ...yt("zRKGfyfwRPY"),
  },
  {
    id: "nadi-shodhan-1",
    name: "Nadi Shodhan Pranayama – Part 1",
    category: "Energy Purification Pranayama",
    group: "Pranayama",
    tags: ["Focus", "Stress"],
    suitableFor: "Students, meditation practitioners, professionals",
    notSuitableFor: "Severe respiratory issues, uncontrolled BP",
    dos: "Practice slow controlled breathing, keep focus steady",
    donts: "Don’t press nostrils hard or rush breathing",
    benefits: "Improves concentration, strengthens lungs",
    icon: "Wind",
    thumbnail: nadiShodhan1Thumb,
    ...yt("K5mtxjJCVzE"),
  },
  {
    id: "nadi-shodhan-2",
    name: "Nadi Shodhan Pranayama – Part 2",
    category: "Advanced Breath Retention Practice",
    group: "Pranayama",
    tags: ["Focus"],
    suitableFor: "Intermediate yoga practitioners, meditation seekers",
    notSuitableFor: "Heart clients, anxiety disorders, severe respiratory issues",
    dos: "Hold breath gently inside and outside",
    donts: "Don’t force retention or panic during practice",
    benefits: "Enhances breath control and focus",
    icon: "Wind",
    thumbnail: nadiShodhan2Thumb,
    ...yt("6omYpWE7pwU"),
  },
  {
    id: "surya-bhedi",
    name: "Surya Bhedi Pranayama",
    category: "Energizing Pranayama",
    group: "Pranayama",
    tags: ["Energy", "Diabetes", "Weight Loss"],
    suitableFor: "Low energy, slow metabolism, diabetes wellness support",
    notSuitableFor: "High BP, acidity, excessive body heat",
    dos: "Inhale right, exhale left, expand stomach while inhaling",
    donts: "Don’t practice in extreme heat or dehydration",
    benefits: "Boosts energy, supports metabolism and fat burn",
    icon: "Sun",
    thumbnail: suryaBhediThumb,
    ...yt("jIsEUI5IPRo"),
  },
  {
    id: "trikonasana",
    name: "Trikonasana (Triangle Pose)",
    category: "Flexibility & Balance Yoga Pose",
    group: "Yoga Asana",
    tags: ["Flexibility", "Posture"],
    suitableFor: "Beginners, flexibility seekers, posture improvement",
    notSuitableFor: "Severe knee pain, vertigo, balance disorders",
    dos: "Keep chest open, stretch gently on both sides",
    donts: "Don’t lock knees or overstretch",
    benefits: "Improves side-body flexibility and balance",
    icon: "Triangle",
    thumbnail: trikonasanaThumb,
    ...yt("lNg-QM42FJ0"),
  },
  {
    id: "vakrasana",
    name: "Vakrasana (Simple Spinal Twist)",
    category: "Twisting Yoga Asana / Detox",
    group: "Yoga Asana",
    tags: ["Digestion", "Flexibility"],
    suitableFor: "People seeking digestive activation and spinal flexibility",
    notSuitableFor: "Pregnancy, slipped disc, spinal injury",
    dos: "Twist gently while keeping spine tall",
    donts: "Don’t force twisting or strain neck",
    benefits: "Activates digestive organs, improves spinal mobility",
    icon: "Move3D",
    thumbnail: vakrasanaThumb,
    ...yt("f_oldHMc0RU"),
  },
];

export const videoGroups: { id: "all" | VideoGroup; label: string; icon: VideoIconName }[] = [
  { id: "all", label: "All", icon: "Target" },
  { id: "Pranayama", label: "Pranayama", icon: "Wind" },
  { id: "Yoga Asana", label: "Yoga", icon: "Flower2" },
  { id: "Bandha", label: "Bandha", icon: "Lock" },
  
];

export const videoTagFilters: { id: "all" | VideoTag; label: string }[] = [
  { id: "all", label: "All Goals" },
  { id: "Diabetes", label: "Diabetes" },
  { id: "Thyroid", label: "Thyroid" },
  { id: "Stress", label: "Stress" },
  { id: "Sleep & Calm", label: "Sleep & Calm" },
  { id: "Energy", label: "Energy" },
  { id: "Weight Loss", label: "Weight Loss" },
  { id: "Digestion", label: "Digestion" },
  { id: "Flexibility", label: "Flexibility" },
  { id: "Posture", label: "Posture" },
  { id: "Focus", label: "Focus" },
];
