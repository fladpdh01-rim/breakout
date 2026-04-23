import { NextResponse } from 'next/server';

// USER: Please replace this URL with your Google Apps Script Web App URL
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyg57qVBEx6MB9PVVSn8eznS3lxp4HSqkQqjFqx66UadRKM_mPwu_9tc8HudK1T9fXJ/exec';

export async function GET() {
  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getRanking`, {
      next: { revalidate: 0 }
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch ranking' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'saveScore',
        name: body.name,
        time: body.time, // Format: MM:SS
      }),
    });
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to save score' }, { status: 500 });
  }
}
