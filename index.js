import express from "express";
import mongoose from "mongoose";
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
  destination: (req, file, cb) => {
    cb(null, "assets/uploads");
  },
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

/* ===================== ROUTES ===================== */

app.get("/", (req, res) => {
  res.send("Pokemon API OK");
});

/**
 * GET paginé
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
 * Recherche par nom
 */
app.get("/pokemons/search", async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).send("Missing name");

  const p = await pokemon.findOne({
    "name.english": { $regex: name, $options: "i" },
  });

  if (!p) return res.status(404).send("Pokemon not found");
  res.json(p);
});

/**
 * GET by id
 */
app.get("/pokemons/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const p = await pokemon.findOne({ id });
  if (!p) return res.status(404).send("Pokemon not found");
  res.json(p);
});

/**
 * CREATE
 */
app.post("/pokemons", async (req, res) => {
  try {
    const created = await pokemon.create(req.body);
    res.status(201).json(created);
  } catch (e) {
    res.status(400).send(e.message);
  }
});

/**
 * UPDATE
 */
app.put("/pokemons/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const updated = await pokemon.findOneAndUpdate(
    { id },
    req.body,
    { new: true, runValidators: true }
  );

  if (!updated) return res.status(404).send("Pokemon not found");
  res.json(updated);
});

/**
 * DELETE
 */
app.delete("/pokemons/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const deleted = await pokemon.findOneAndDelete({ id });

  if (!deleted) return res.status(404).send("Pokemon not found");
  res.json({ message: "Deleted" });
});

/* ===================== SERVER ===================== */
app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
