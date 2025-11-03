export default function handler(req, res) {
  const key = process.env.MAPTILER_API_KEY || "";
  res.json({ maptilerKey: key });
}

