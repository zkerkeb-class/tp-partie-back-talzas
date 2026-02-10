import mongoose from "mongoose";

console.log("Attempting to connect to MongoDB...");

export const connectDB = async () => {
    try {
        await mongoose.connect("mongodb://localhost:27017/pokemons");
        console.log("Connected to MongoDB successfully");
    } catch (error) {
        console.error("Error connecting to MongoDB:", error);
        process.exit(1);
    }
};


connectDB();