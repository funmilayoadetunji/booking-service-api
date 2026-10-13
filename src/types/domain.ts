export type UserRole = 'admin' | 'customer';
export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';

export type User = {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PublicUser = Omit<User, 'passwordHash'>;

export type Service = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Booking = {
  id: string;
  customerId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  serviceName?: string;
  durationMinutes?: number;
};

export type PageMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export type Paginated<T> = {
  data: T[];
  meta: PageMeta;
};
