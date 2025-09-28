# Marriage Weekly Tasks System

A simplified marriage task system that integrates with your existing marriage profile and uses your weekly task markdown file.

## 🏆 Marriage Levels (Lowest to Highest)

1. **💕 Newlywed Bliss** (0 XP) - Just married and discovering each other
2. **👶 First Steps** (100 XP) - Learning to navigate married life together  
3. **🌙 Midnight Feedings** (300 XP) - Supporting each other through challenges
4. **🤝 In-Law Diplomacy** (600 XP) - Mastering the art of family relations
5. **🎯 Couple Goals** (1000 XP) - Setting and achieving dreams together
6. **✨ Golden Groove** (1500 XP) - Finding your perfect rhythm as a couple
7. **🏖️ Second Honeymoon** (2100 XP) - Rekindling the romance and adventure
8. **🏗️ Legacy Builders** (2800 XP) - Building something meaningful together
9. **🔥 Eternal Flame** (3600 XP) - A love that burns bright and eternal
10. **💎 Diamond Years** (4500 XP) - The pinnacle of marital achievement

## 🎮 Available Commands

### Main Command
- `/marriage-task view` - View your current weekly tasks (same as View Tasks button)
- `/marriage-task` with options for Task 1, Task 2, Task 3, Task 4

### Enhanced Profile
- `/marriage-profile` - Shows your marriage profile INCLUDING weekly tasks with a "View Tasks" button

## 📋 Weekly Challenge Types

### 🎮 Game Challenges
- **Tic Tac Toe Victory**: Win a game of tic tac toe together (25 XP)
- **Know Each Other Quiz**: Score 80% or higher on compatibility quiz (30 XP)

### 🎨 Creative Challenges  
- **Plant a Tree**: Plant and keep a tree alive for 7 days (40 XP)
- **Poem Together**: Write a poem and get community votes (35 XP)

### 👥 Social Challenges
- **Marriage Mentor**: Help another couple with advice (45 XP)
- **Double Date**: Participate in group activities with other couples (30 XP)

### 💰 Financial Challenges
- **Savings Goal**: Save 10,000 coins in shared bank (50 XP)
- **Team Earners**: Both partners earn money on same day (20 XP)

### 🌟 Bonus Challenges (Optional)
- **Anniversary Celebration**: Special anniversary activities (100 XP)
- **Level Up Together**: Reach next marriage level this week (75 XP)

## 🗃️ Database Schema

### New Tables Added:
- `marriage_levels` - Tracks couple's current level, XP, and progression
- `marriage_challenges` - Stores weekly challenge templates  
- `marriage_challenge_progress` - Tracks completion status for each couple

## 🎁 Level Benefits

Each level provides increasing benefits:
- **Lower Levels**: Basic marriage perks, transfer tax reduction
- **Mid Levels**: Enhanced rewards, premium challenge access
- **Higher Levels**: Golden couple status, mentorship opportunities
- **Max Level**: Diamond couple status, Hall of Fame entry

## 🔄 Weekly Challenge System

- New challenges generated every Monday
- 4 regular challenges (one from each category)
- 1 optional bonus challenge  
- XP rewards scale with marriage level
- Progress tracked per couple per week

## 🚀 Getting Started

1. **Get Married**: Use `/propose` and `/start-marriage` 
2. **Check Tasks**: Use `/marriage-profile` to see your tasks, or `/marriage-task view`
3. **Complete Tasks**: Use `/marriage-task` with Task 1, Task 2, Task 3, or Task 4 options
4. **Track Progress**: Your progress shows automatically in `/marriage-profile`
5. **Update Tasks**: Edit `/marriages/Tasks-For-This-Week.md` to change weekly tasks

## 📊 Progress Tracking

- Real-time challenge completion tracking
- Visual progress bars for level advancement  
- Leaderboard to compare with other couples
- Anniversary reminders and celebrations
- Achievement unlocks at each level

## 🛠️ Technical Implementation

- Built with Discord.js v14
- MySQL database backend
- Interactive buttons and select menus
- Modal forms for creative input
- Real-time game state management
- Comprehensive error handling and logging

---

*Ready to strengthen your marriage through fun challenges and games! Start your journey today!* 💕