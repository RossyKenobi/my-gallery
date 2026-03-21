import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const ACTION = process.env.IG_ACTION || 'SYNC';
const EMBED_KEY = process.env.IG_EMBED_KEY;
const POST_ID_DELETE = process.env.IG_POST_ID;

// Resolve paths relative to the project root (adjusting if running from .github/scripts)
const ASSETS_DIR = path.resolve('../../public/images/posts');
const DATA_DIR = path.resolve('../../src/data');

async function downloadAndOptimizeImage(url, id, index = 0) {
  const filename = `${id}_${index}.webp`;
  const filepath = path.join(ASSETS_DIR, filename);
  
  try {
    await fs.access(filepath);
    return `/images/posts/${filename}`;
  } catch (e) {
    // File does not exist, proceed
  }

  console.log(`Downloading ${filename}...`);
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);
    const buffer = await response.arrayBuffer();
    
    await sharp(buffer)
      .resize({ width: 2560, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(filepath);
      
    return `/images/posts/${filename}`;
  } catch (err) {
    console.error(`Error downloading image ${url}:`, err);
    return null;
  }
}

async function getShortcode(input) {
  // Support both full HTML embeds and direct URLs, trailing slashes optional
  const regex = /\/p\/([A-Za-z0-9_-]+)(?:\/|\?|["']|$)/;
  const match = input.match(regex);
  if (match) return match[1];
  
  // If no match, try cleaning up the input if it's a URL
  const cleaned = input.trim().split('?')[0].replace(/\/$/, '').split('/').pop();
  return cleaned || input.trim();
}

async function scrapePost(shortcode) {
  const url = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
  console.log(`Scraping ${url}...`);
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.5'
    }
  });

  if (!response.ok) {
    console.error(`Failed to fetch embed page: ${response.status} ${response.statusText}`);
    process.exit(1);
  }

  const html = await response.text();
  console.log(`Fetched HTML length: ${html.length} bytes`);
  
  if (html.includes('login_container') || html.length < 1000) {
    console.error("Received a login page or very short HTML. Instagram is likely blocking this request.");
    console.error("HTML Snippet: " + html.slice(0, 500).replace(/\n/g, ' '));
    process.exit(1);
  }

  // Robust extraction of CDN image URLs (JPG and WEBP)
  const imgRegex = /https:\/\/scontent[^" ]+?\.(?:jpg|webp)[^" ]*/g;
  const rawImages = (html.match(imgRegex) || []).map(url => url.replace(/\\u0026/g, '&').replace(/&amp;/g, '&'));
  
  console.log(`Found ${rawImages.length} raw image URL matches in HTML.`);
  if (rawImages.length === 0) {
    console.error("No image URLs found in the HTML. Instagram might have changed the embed format.");
    console.error("HTML Snippet: " + html.slice(0, 1000).replace(/\n/g, ' '));
    process.exit(1);
  }

  const uniqueImages = new Map();
  
  for (const imgUrl of rawImages) {
    // Basic filter for tracking pixels or tiny icons
    if (imgUrl.includes('sticker') || imgUrl.includes('emoji') || imgUrl.includes('checkmark')) continue;

    const leafName = imgUrl.split('?')[0].split('/').pop();
    if (!leafName) continue;
    
    // Score based on resolution indicators
    let score = 0;
    if (imgUrl.includes('s1080x1080')) score = 3;
    else if (imgUrl.includes('s750x750')) score = 2;
    else if (imgUrl.includes('s640x640')) score = 1;

    if (!uniqueImages.has(leafName) || score > uniqueImages.get(leafName).score) {
      uniqueImages.set(leafName, { url: imgUrl, score });
    }
  }

  const images = Array.from(uniqueImages.values())
    .filter(item => !item.url.includes('s150x150')) // Exclude profile pics/thumbnails
    .map(item => item.url);

  // Extract caption
  const captionRegex = /"caption":"([^"]+)"/;
  const captionMatch = html.match(captionRegex);
  let caption = captionMatch ? captionMatch[1] : '';
  caption = caption.replace(/\\n/g, '\n').replace(/\\u([0-9a-fA-F]{4})/g, (m, p1) => String.fromCharCode(parseInt(p1, 16)));

  return {
    id: shortcode,
    caption,
    timestamp: new Date().toISOString(),
    images: images.slice(0, 10), // Limit to 10 images
    category: 'Embedded'
  };
}

async function run() {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  const postsPath = path.join(DATA_DIR, 'posts.json');
  let existingPosts = [];
  try {
    const data = await fs.readFile(postsPath, 'utf-8');
    existingPosts = JSON.parse(data);
  } catch (e) {}

  if (ACTION === 'DELETE') {
    console.log(`Deleting post ${POST_ID_DELETE}...`);
    const filteredPosts = existingPosts.filter(p => p.id !== POST_ID_DELETE);
    await fs.writeFile(postsPath, JSON.stringify(filteredPosts, null, 2));
    console.log(`Deleted ${POST_ID_DELETE}.`);
    return;
  }

    if (ACTION === 'REORDER') {
        const newOrder = JSON.parse(EMBED_KEY); // In REORDER mode, embed_key contains the IDs array
        console.log(`Reordering posts based on: ${newOrder.join(', ')}`);
        
        const orderedPosts = newOrder.map(id => existingPosts.find(p => p.id === id)).filter(Boolean);
        
        // Keep any posts that weren't in the newOrder array (safety)
        const missingPosts = existingPosts.filter(p => !newOrder.includes(p.id));
        const finalPosts = [...orderedPosts, ...missingPosts];

        await fs.writeFile(postsPath, JSON.stringify(finalPosts, null, 2));
        console.log("Successfully reordered posts.");
        return;
    }

  if (ACTION === 'ADD') {
    if (!EMBED_KEY) {
      console.error("No EMBED_KEY provided for ADD action.");
      process.exit(1);
    }
    const shortcode = await getShortcode(EMBED_KEY);
    console.log(`Adding post with shortcode: ${shortcode}`);
    
    const postData = await scrapePost(shortcode);
    
    if (!postData.images || postData.images.length === 0) {
      console.error("Scraper found 0 images in the embed. Instagram might be blocking the request or the structure changed.");
      process.exit(1);
    }

    const downloadedImages = [];
    for (let i = 0; i < postData.images.length; i++) {
        const imgPath = await downloadAndOptimizeImage(postData.images[i], postData.id, i);
        if (imgPath) downloadedImages.push(imgPath);
    }
    
    postData.images = downloadedImages;
    if (postData.images.length === 0) {
        console.error("Failed to download/optimize any of the found images.");
        process.exit(1);
    }

    // Append to list
    const updatedPosts = [...existingPosts.filter(p => p.id !== postData.id), postData];
    await fs.writeFile(postsPath, JSON.stringify(updatedPosts, null, 2));
    console.log(`Successfully added post ${shortcode} with ${downloadedImages.length} images.`);
    return;
  }

  // DEFAULT: SYNC (Original Logic)
  if (!ACCESS_TOKEN) {
    console.warn("No IG_ACCESS_TOKEN found. Sync skipped.");
    return;
  }
  
  console.log("Syncing all posts from Instagram API...");
  const res = await fetch(API_URL);
  const data = await res.json();

  if (data.error) throw new Error(data.error.message);

  const syncedPosts = [];
  for (const item of data.data) {
    if (item.media_type === 'VIDEO') continue;

    const post = {
      id: item.id,
      caption: item.caption || '',
      timestamp: item.timestamp,
      images: [],
      hidden: false,
      category: 'Uncategorized'
    };

    if (item.media_type === 'IMAGE') {
      const imgPath = await downloadAndOptimizeImage(item.media_url, item.id);
      if (imgPath) post.images.push(imgPath);
    } else if (item.media_type === 'CAROUSEL_ALBUM') {
      if (item.children && item.children.data) {
        let idx = 0;
        for (const child of item.children.data) {
          if (child.media_type === 'IMAGE') {
            const imgPath = await downloadAndOptimizeImage(child.media_url, item.id, idx++);
            if (imgPath) post.images.push(imgPath);
          }
        }
      }
    }
    
    if (post.images.length > 0) syncedPosts.push(post);
  }

  const mergedPosts = syncedPosts.map(newPost => {
    const existing = existingPosts.find(p => p.id === newPost.id);
    if (existing) {
      return { ...newPost, hidden: existing.hidden, category: existing.category };
    }
    return newPost;
  });

  await fs.writeFile(postsPath, JSON.stringify(mergedPosts, null, 2));
  console.log("Successfully synced Instagram posts!");
}

run().catch(console.error);
