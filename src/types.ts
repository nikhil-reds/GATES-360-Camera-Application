export interface EventImage {
  id: string;
  url: string;
  groupName: string;
  timestamp: number;
  isVisible: boolean;
}

export interface CertificateRecord {
  id: string;
  userName: string;
  userEmail: string;
  groupName: string;
  imageUrl: string;
  teamName?: string;
  designation?: string;
  certificateUrl?: string;
  feedback?: string;
  showOnDisplay?: boolean;
  gradient?: string;
  createdAt: number;
}
