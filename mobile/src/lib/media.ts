import * as ImagePicker from 'expo-image-picker';

/**
 * Launch the photo library and return the picked image URIs.
 * Returns an empty array if permission is denied or the user cancels.
 * Photos are secondary to writing, so we cap the selection.
 */
export async function pickImages(selectionLimit = 6): Promise<string[]> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit,
    quality: 0.8,
  });

  if (result.canceled) return [];
  return result.assets.map((asset) => asset.uri);
}
