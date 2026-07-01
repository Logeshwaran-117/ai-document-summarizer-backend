const fs = require("fs");
const path = require("path");

const historyPath = path.join(__dirname, "../data/history.json");

const Document = require('../models/Document');

async function saveHistory(userId, record) {
  return await Document.create({ userId, ...record });
}

async function getHistory(userId) {
  return await Document.find({ userId }).sort({ uploadedAt: -1 });
}

async function deleteHistory(id, userId) {
  return await Document.findOneAndDelete({ _id: id, userId });
}

module.exports = {
    saveHistory,
    getHistory,
    deleteHistory
};

