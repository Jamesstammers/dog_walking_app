export type ServiceKind = 'solo_walk' | 'group_walk' | 'sit_in';
export type BookingStatus = 'requested' | 'approved' | 'declined' | 'cancelled' | 'completed';
export type PaymentMethod = 'card' | 'invoice';
export type PaymentStatus = 'unpaid' | 'card_saved' | 'paid' | 'invoiced' | 'refunded' | 'failed';

export type Profile = {
  id: string;
  role: 'customer' | 'owner';
  full_name: string;
  phone: string | null;
  address: string | null;
  postcode: string | null;
  approved: boolean;
  invoice_allowed: boolean;
};

export type Dog = {
  id: string;
  owner_id: string;
  name: string;
  breed: string | null;
  vet_details: string | null;
  vaccinations_up_to_date: boolean;
  good_with_other_dogs: boolean;
  notes: string | null;
  photo_url: string | null;
};

export type Service = {
  id: string;
  kind: ServiceKind;
  duration_min: 30 | 60;
  name: string;
  price_pence: number;
  max_dogs: number;
  active: boolean;
};

export type Booking = {
  id: string;
  customer_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  price_pence: number;
  customer_notes: string | null;
  batch_id: string | null;
  services?: Pick<Service, 'name' | 'kind'>;
  booking_dogs?: { dogs: Pick<Dog, 'name'> }[];
};

export type Post = {
  id: string;
  author_id: string;
  caption: string;
  photo_url: string | null;
  created_at: string;
  post_dogs?: { dog_id: string; dogs: Pick<Dog, 'name' | 'photo_url'> }[];
};

export type BusinessInfo = {
  id: number;
  name: string;
  about: string;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  instagram: string | null;
  facebook: string | null;
  service_area: string | null;
  hours_note: string | null;
};
