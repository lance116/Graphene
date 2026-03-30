import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const user = await getUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Check verified
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_verified")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.is_verified) {
    return NextResponse.json({ error: "Only verified users can upload avatars" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${user.id}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path);
  // Append cache-buster so browsers pick up the new image
  const avatar_url = urlData.publicUrl + "?v=" + Date.now();

  // Update profile
  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url, updated_at: new Date().toISOString() })
    .eq("id", user.id)
    .select()
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ profile: updated });
}
