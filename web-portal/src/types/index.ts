export interface User {
  id: string;
  discordId: string;
  username: string;
  discriminator: string;
  avatar: string;
  email?: string;
  balance: number;
  totalWinnings: number;
  totalLosses: number;
  gamesPlayed: number;
  joinedAt: Date;
  lastActive: Date;
  isActive: boolean;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (code: string) => Promise<void>;
  logout: () => void;
}

export interface GameStats {
  gameType: string;
  gamesPlayed: number;
  totalWinnings: number;
  totalLosses: number;
  winRate: number;
  bestWin: number;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  avatar: string;
  value: number;
  rank: number;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'boosts' | 'cosmetics' | 'premium';
  iconUrl: string;
  isActive: boolean;
  benefits: string[];
  duration?: number; // in hours for temporary items
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'purchase' | 'game_win' | 'game_loss' | 'transfer' | 'deposit';
  amount: number;
  description: string;
  timestamp: Date;
  gameType?: string;
  itemId?: string;
}

export interface DashboardStats {
  totalBalance: number;
  totalWinnings: number;
  totalLosses: number;
  gamesPlayed: number;
  gamesWon: number;
  winRate: number;
  favoriteGame: string;
  currentRank: number;
  recentTransactions: Transaction[];
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'digital_wallet';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}