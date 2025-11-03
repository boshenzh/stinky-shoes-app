// Config endpoint - returns Protomaps API key if available
export default function handler(req, res) {
  const protomapsKey = process.env.PROTOMAPS_API_KEY || "";
  res.json({ 
    protomapsKey: protomapsKey,
    maptilerKey: "" // Legacy - kept for backward compatibility
  });
}

