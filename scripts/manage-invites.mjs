import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { randomBytes } from 'crypto';

dotenv.config({ path: '.env.local' });

if (!process.env.POSTGRES_URL) {
  console.error("Missing POSTGRES_URL in .env.local");
  process.exit(1);
}

const sql = neon(process.env.POSTGRES_URL);

// 生成 8 位大写字母数字组合的邀请码
function generateCode() {
  return randomBytes(4).toString('hex').toUpperCase();
}

async function main() {
  const action = process.argv[2];

  try {
    if (action === 'generate') {
      const code = generateCode();
      await sql`
        INSERT INTO invitation_codes (code, is_used, created_at)
        VALUES (${code}, false, NOW())
      `;
      console.log(`✅ 成功生成新邀请码: ${code}`);
    } 
    else if (action === 'list') {
      const unusedCodes = await sql`
        SELECT code, created_at FROM invitation_codes
        WHERE is_used = false
        ORDER BY created_at DESC
      `;
      console.log('--- 🟢 未使用的邀请码 ---');
      if (unusedCodes.length === 0) console.log('(空)');
      unusedCodes.forEach(c => console.log(`${c.code} (创建于: ${new Date(c.created_at).toLocaleString()})`));
    } 
    else if (action === 'used') {
      const usedCodes = await sql`
        SELECT code, used_by_clerk_id, used_at FROM invitation_codes
        WHERE is_used = true
        ORDER BY used_at DESC
      `;
      console.log('--- 🔴 已使用的邀请码 ---');
      if (usedCodes.length === 0) console.log('(空)');
      usedCodes.forEach(c => {
        const time = c.used_at ? new Date(c.used_at).toLocaleString() : '未知时间';
        console.log(`${c.code} -> 被用户 [${c.used_by_clerk_id || '未知'}] 使用 (使用时间: ${time})`);
      });
    } 
    else {
      console.log(`
用法:
  node scripts/manage-invites.mjs generate   # 生成一个新的邀请码
  node scripts/manage-invites.mjs list       # 查看所有未使用的邀请码
  node scripts/manage-invites.mjs used       # 查看所有已被使用的邀请码
      `);
    }
  } catch (err) {
    console.error("❌ 数据库操作失败:", err);
  }
}

main();
