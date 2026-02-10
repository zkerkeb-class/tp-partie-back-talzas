import express from "express";
import pokemon from "./schema/pokemon.js";
import "./connect.js";

import multer from "multer";
import path from "path";

const app = express();

/* ===================== MIDDLEWARE ===================== */
app.use(express.json());

// CORS (simple pour TP)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Servir les images
app.use("/assets", express.static("assets"));

/* ===================== UPLOAD IMAGE ===================== */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "assets/uploads"),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || ".png");
    const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, filename);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
});

app.post("/upload", upload.single("image"), (req, res) => {
  if (!req.file) return res.status(400).send("No file uploaded");
  const url = `http://localhost:3000/assets/uploads/${req.file.filename}`;
  res.json({ url });
});

/* ===================== HELPERS SEARCH ===================== */
function escapeRegex(str = "") {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectMatchField(p, queryLower) {
  const fields = [
    ["english", p?.name?.english],
    ["french", p?.name?.french],
    ["japanese", p?.name?.japanese],
    ["chinese", p?.name?.chinese],
  ];

  for (const [key, value] of fields) {
    if (typeof value === "string" && value.toLowerCase().includes(queryLower)) {
      return { matchedField: key, matchedValue: value };
    }
  }
  return { matchedField: null, matchedValue: null };
}

/* ===================== ROUTES ===================== */
app.get("/", (req, res) => {
  res.send("Pokemon API OK");
});

/**
 * GET paginé
 * /pokemons?page=1&limit=20
 */
app.get("/pokemons", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      pokemon.find({}).sort({ id: 1 }).skip(skip).limit(limit),
      pokemon.countDocuments(),
    ]);

    res.json({
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    });
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/**
 * 🔍 SEARCH multi-langues + partiel
 * /pokemons/search?name=bulb
 *
 * Retourne:
 * { pokemon: {...}, matchedField: "french", matchedValue: "Bulbizarre" }
 */
app.get("/pokemons/search", async (req, res) => {
  const name = (req.query.name || "").trim();
  if (!name) return res.status(400).send("Missing name");

  try {
    const safe = escapeRegex(name);
    const regex = new RegExp(safe, "i");

    const p = await pokemon.findOne({
      $or: [
        { "name.english": regex },
        { "name.french": regex },
        { "name.japanese": regex },
        { "name.chinese": regex },
      ],
    });

    if (!p) return res.status(404).send("Pokemon not found");

    const { matchedField, matchedValue } = detectMatchField(p, name.toLowerCase());

    res.json({
      pokemon: p,
      matchedField,   // english | french | japanese | chinese | null
      matchedValue,   // la valeur exacte qui a matché
    });
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/**
 * ✨ AUTOCOMPLETE (suggestions)
 * /pokemons/suggest?query=bul&limit=8
 *
 * Retourne une liste légère (id + noms + champ matché)
 */
app.get("/pokemons/suggest", async (req, res) => {
  const query = (req.query.query || "").trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit || "8", 10), 1), 20);

  if (!query) return res.json({ items: [] });

  try {
    const safe = escapeRegex(query);
    const regex = new RegExp(safe, "i");

    const list = await pokemon
      .find(
        {
          $or: [
            { "name.english": regex },
            { "name.french": regex },
            { "name.japanese": regex },
            { "name.chinese": regex },
          ],
        },
        {
          id: 1,
          name: 1,
          image: 1,
          type: 1,
        }
      )
      .sort({ id: 1 })
      .limit(limit);

    const qLower = query.toLowerCase();

    const items = list.map((p) => {
      const { matchedField, matchedValue } = detectMatchField(p, qLower);
      return {
        id: p.id,
        name: p.name,
        image: p.image,
        type: p.type,
        matchedField,
        matchedValue,
      };
    });

    res.json({ items });
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/**
 * GET by id
 */
app.get("/pokemons/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const p = await pokemon.findOne({ id });
    if (!p) return res.status(404).send("Pokemon not found");
    res.json(p);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/**
 * CREATE
 */
app.post("/pokemons", async (req, res) => {
  try {
    const created = await pokemon.create(req.body);
    res.status(201).json(created);
  } catch (e) {
    // duplicate id
    if (e?.code === 11000) return res.status(409).send("Pokemon id already exists");
    res.status(400).send(e.message);
  }
});

/**
 * UPDATE
 */
app.put("/pokemons/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    const updated = await pokemon.findOneAndUpdate(
      { id },
      req.body,
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).send("Pokemon not found");
    res.json(updated);
  } catch (e) {
    res.status(400).send(e.message);
  }
});

/**
 * DELETE
 */
app.delete("/pokemons/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const deleted = await pokemon.findOneAndDelete({ id });
    if (!deleted) return res.status(404).send("Pokemon not found");
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).send(e.message);
  }
});

/* ===================== SERVER ===================== */
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
