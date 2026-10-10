export type Visibility = "private" | "household" | "public";
export type Idea = {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  specifications: string;
  private_note: string;
  url: string | null;
  image_url: string | null;
  image_credit: { name: string; url: string; downloadUrl?: string } | null;
  price_min: number | null;
  price_max: number | null;
  visibility: Visibility;
  candidates: string[];
  created_at: string;
};
export type Proposal = {
  id: string;
  idea_id: string;
  recipient_id: string | null;
  list_ids: string[];
  is_global: boolean;
  priority: number;
  collective: boolean;
  target_amount: number | null;
  contributed: number;
  reserved: boolean;
  archive_reason: string | null;
  archive_note: string;
  archived_at: string | null;
  created_at: string;
};
export type Recipient = { id: string; name: string; is_common: boolean };
export type GiftList = {
  id: string;
  name: string;
  slogan: string;
  image_url: string | null;
  share_token: string;
  archived_at: string | null;
  created_at: string;
};
export type Profile = {
  id: string;
  display_name: string;
  email: string;
  preferences: Record<string, unknown>;
};
export type Activity = {
  id: number;
  idea_id: string | null;
  actor_id: string | null;
  message: string;
  changes: Record<string, { before: unknown; after: unknown }>;
  created_at: string;
};
export type Dataset = {
  ideas: Idea[];
  proposals: Proposal[];
  lists: GiftList[];
  recipients: Recipient[];
  profile: Profile;
  profiles: Profile[];
  activity: Activity[];
  shares: {
    list_id: string;
    contact_name: string;
    channel: string;
    created_at: string;
  }[];
};
export type SharedGift = {
  id: string;
  title: string;
  description: string;
  specifications: string;
  url: string | null;
  imageUrl: string | null;
  imageCredit: Idea["image_credit"];
  priceMin: number | null;
  priceMax: number | null;
  priority: number;
  recipient: string;
  recipientId: string;
  collective: boolean;
  targetAmount: number | null;
  contributed: number;
  reserved: boolean;
};
export type SharedList = {
  id: string;
  name: string;
  slogan: string;
  imageUrl: string | null;
  archived: boolean;
  gifts: SharedGift[];
};
