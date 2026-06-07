export type YouTubeVideo = {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string;
  durationSeconds: number | null;
  embeddable: boolean;
};

export type YouTubeSearchResponse = {
  items: YouTubeVideo[];
  nextPageToken?: string;
};
