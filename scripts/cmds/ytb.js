const axios = require("axios");
const fs = require("fs");
const yts = require("yt-search");
const path = require("path");

const cacheDir = path.join(__dirname, "/cache");
const tmp = path.join(__dirname, "/tmp");

if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir);
if (!fs.existsSync(tmp)) fs.mkdirSync(tmp);

module.exports = {
  config: {
    name: "ytb",
    version: "1.3",
    author: "ROBIUL 😍",
    countDown: 5,
    role: 0,
    description: {
      en: "Search and download audio or video from YouTube",
    },
    category: "media",
    guide: {
      en: "{pn} -v <search term>: Download video\n{pn} -a <search term>: Download audio",
    },
  },

  onStart: async ({ api, args, event }) => {
    if (args.length < 2) {
      return api.sendMessage(
        "âŒ Invalid format. Use:\n- /ytb -v <search term> for video\n- /ytb -a <search term> for audio",
        event.threadID,
        event.messageID
      );
    }

    const flag = args[0].toLowerCase();
    const searchTerm = args.slice(1).join(" ");
    const isAudio = flag === "-a" || flag === "audio";
    const isVideo = flag === "-v" || flag === "video";

    if (!isAudio && !isVideo) {
      return api.sendMessage(
        "âŒ Invalid flag. Use:\n- /ytb -v <search term> for video\n- /ytb -a <search term> for audio",
        event.threadID,
        event.messageID
      );
    }

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
          attachment: await Promise.all(
            videos.map((video) =>
              downloadThumbnail(video.thumbnail, path.join(tmp, `thumbnail_${video.videoId}.jpg`))
            )
          ),
        },
        event.threadID,
        (err, info) => {
          global.GoatBot.onReply.set(info.messageID, {
            commandName: "ytb",
            messageID: info.messageID,
            author: event.senderID,
            videos,
            isAudio,
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
      const apiEndpoint = `https://alldownloader-mj2x.onrender.com/alldl?link=${encodeURIComponent(videoUrl)}`;
      const response = await axios.get(apiEndpoint);

      if (!response.data.download_url) {
        throw new Error("Download URL not found in the API response.");
      }

      const downloadUrl = response.data.download_url;
      const filePath = path.join(
        cacheDir,
        Reply.isAudio ? `ytb_audio_${selectedVideo.videoId}.mp3` : `ytb_video_${selectedVideo.videoId}.mp4`
      );

      await downloadFile(downloadUrl, filePath);

      api.setMessageReaction("âœ…", event.messageID, () => {}, true);
      await api.sendMessage(
        {
          body: `ðŸ“¥ ${Reply.isAudio ? "Audio" : "Video"} download successful:\nâ€¢ Title: ${selectedVideo.title}\nâ€¢ Channel: ${selectedVideo.author.name}`,
          attachment: fs.createReadStream(filePath),
        },
        event.threadID,
        () => fs.unlinkSync(filePath),
        event.messageID
      );
    } catch (error) {
      console.error("Download error:", error.message || error);
      return api.sendMessage(`âŒ Failed to download: ${error.message || "Unknown error"}`, event.threadID, event.messageID);
    }
  },
};

async function downloadThumbnail(url, pathName) {
  try {
    const response = await axios.get(url, { responseType: "stream" });
    response.data.pipe(fs.createWriteStream(pathName));
    return new Promise((resolve) => {
      response.data.on("end", () => resolve(fs.createReadStream(pathName)));
    });
  } catch (error) {
    console.error("Thumbnail download error:", error);
    return null;
  }
}

async function downloadFile(url, filePath) {
  const writer = fs.createWriteStream(filePath);
  const response = await axios.get(url, { responseType: "stream" });

  return new Promise((resolve, reject) => {
    response.data.pipe(writer);
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}
