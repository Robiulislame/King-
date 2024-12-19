const axios = require("axios");
const fs = require("fs");
const yts = require("yt-search");
const path = require("path");
const cacheDir = path.join(__dirname, "/cache");
const tmp = path.join(__dirname, "/tmp");

module.exports = {
  config: {
    name: "sing",
    version: "1.1",
    aliases: ["song"],
    author: "ROBIUL 😍",
    countDown: 5,
    role: 0,
    description: {
      en: "Search and download audio from YouTube",
    },
    category: "media",
    guide: {
      en: "{pn} <search term>: search YouTube and download selected audio",
    },
  },

  onStart: async ({ api, args, event }) => {
    if (args.length < 1) {
      return api.sendMessage("âŒ Please use the format '/sing <search term>'.", event.threadID, event.messageID);
    }

    const searchTerm = args.join(" ");
    try {
      const searchResults = await yts(searchTerm);
      const videos = searchResults.videos.slice(0, 6);

      if (videos.length === 0) {
        return api.sendMessage(`â­• No results found for: ${searchTerm}`, event.threadID, event.messageID);
      }

      let msg = "";
      videos.forEach((video, index) => {
        msg += `${index + 1}. ${video.title}\nDuration: ${video.timestamp}\nChannel: ${video.author.name}\n\n`;
      });

      api.sendMessage(
        {
          body: msg + "Reply with a number to select.",
          attachment: await Promise.all(videos.map(video => fahimcalyx(video.thumbnail, path.join(tmp, `thumbnail_${video.videoId}.jpg`)))),
        },
        event.threadID,
        (err, info) => {
          global.GoatBot.onReply.set(info.messageID, {
            commandName: "sing",
            messageID: info.messageID,
            author: event.senderID,
            videos,
          });
        },
        event.messageID
      );
    } catch (error) {
      console.error(error);
      return api.sendMessage("âŒ Failed to search YouTube.", event.threadID, event.messageID);
    }
  },

  onReply: async ({ event, api, Reply }) => {
    await api.unsendMessage(Reply.messageID);
    api.setMessageReaction("â³", event.messageID, () => {}, true);

    const choice = parseInt(event.body);
    if (isNaN(choice) || choice <= 0 || choice > Reply.videos.length) {
      return api.sendMessage("âŒ Please enter a valid number.", event.threadID, event.messageID);
    }

    const selectedVideo = Reply.videos[choice - 1];
    const videoUrl = selectedVideo.url;

    try {
      const downloadUrlEndpoint = `https://alldownloader-mj2x.onrender.com/alldl?link=${encodeURIComponent(videoUrl)}`;
      const respo = await axios.get(downloadUrlEndpoint);
      const downloadUrl = respo.data.download_url;

      if (!downloadUrl) {
        return api.sendMessage("âŒ Could not retrieve an MP3 file. Please try again with a different search.", event.threadID, event.messageID);
      }

      const totalSize = await getTotalSize(downloadUrl);
      const audioPath = path.join(cacheDir, `ytb_audio_${selectedVideo.videoId}.mp3`);
      await downloadFileParallel(downloadUrl, audioPath, totalSize, 5);

      api.setMessageReaction("âœ…", event.messageID, () => {}, true);
      await api.sendMessage(
        {
          body: `ðŸ“¥ Audio download successful:\nâ€¢ Title: ${selectedVideo.title}\nâ€¢ Channel: ${selectedVideo.author.name}`,
          attachment: fs.createReadStream(audioPath),
        },
        event.threadID,
        () => fs.unlinkSync(audioPath),
        event.messageID
      );
    } catch (e) {
      console.error(e);
      return api.sendMessage("âŒ Failed to download.", event.threadID, event.messageID);
    }
  },
};

async function fahimcalyx(url, pathName) {
  try {
    const response = await axios.get(url, { responseType: "stream" });
    response.data.pipe(fs.createWriteStream(pathName));
    return new Promise((resolve) => {
      response.data.on("end", () => resolve(fs.createReadStream(pathName)));
    });
  } catch (error) {
    console.error(error);
    return null;
  }
}

async function getTotalSize(url) {
  const response = await axios.head(url);
  return parseInt(response.headers["content-length"], 10);
}

async function downloadFileParallel(url, filePath, totalSize, numChunks) {
  const chunkSize = Math.ceil(totalSize / numChunks);
  const chunks = [];
  const progress = Array(numChunks).fill(0);

  async function downloadChunk(url, start, end, index) {
    try {
      const response = await axios.get(url, {
        headers: { Range: `bytes=${start}-${end}` },
        responseType: "arraybuffer",
        timeout: 15000,
      });

      progress[index] = response.data.byteLength;
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize - 1, totalSize - 1);
    chunks.push(downloadChunk(url, start, end, i));
  }

  try {
    const buffers = await Promise.all(chunks);

    const fileStream = fs.createWriteStream(filePath);
    for (const buffer of buffers) {
      fileStream.write(Buffer.from(buffer));
    }

    await new Promise((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
      fileStream.end();
    });
  } catch (error) {
    console.error("Error downloading or writing the file:", error);
  }
    }
