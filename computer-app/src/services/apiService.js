import axios from 'axios';

const API_BASE_URL = '/api/computer';

// Create axios instance with default config
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

export const apiService = {
    // Get all files and folders
    getFiles: async () => {
        try {
            const response = await apiClient.get('/files');
            return response.data;
        } catch (error) {
            console.error('Error fetching files:', error);
            throw error;
        }
    },

    // Upload a file
    uploadFile: async (file, folder = 'My Documents') => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder);

        try {
            const response = await apiClient.post('/upload', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return response.data;
        } catch (error) {
            console.error('Error uploading file:', error);
            throw error;
        }
    },

    // Update file metadata (move to folder)
    updateFile: async (fileId, folder) => {
        try {
            const response = await apiClient.put(`/file/${fileId}`, { folder });
            return response.data;
        } catch (error) {
            console.error('Error updating file:', error);
            throw error;
        }
    },

    // Delete a file
    deleteFile: async (fileId) => {
        try {
            const response = await apiClient.delete(`/file/${fileId}`);
            return response.data;
        } catch (error) {
            console.error('Error deleting file:', error);
            throw error;
        }
    },

    // Delete a folder (Recursive)
    deleteFolder: async (folderName) => {
        try {
            const response = await apiClient.delete(`/folder/${folderName}`);
            return response.data;
        } catch (error) {
            console.error('Error deleting folder:', error);
            throw error;
        }
    },

    // Create a new virtual folder
    createFolder: async (folderName, parentId = 'Desktop') => {
        try {
            const response = await apiClient.post('/folder', { name: folderName, parentId });
            return response.data;
        } catch (error) {
            console.error('Error creating folder:', error);
            throw error;
        }
    },

    // Get storage quota information
    getQuota: async () => {
        try {
            const response = await apiClient.get('/quota');
            return response.data;
        } catch (error) {
            console.error('Error fetching quota:', error);
            throw error;
        }
    }
};
