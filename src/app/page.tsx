'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { supabase } from '@/lib/supabase';
import { User } from '@supabase/supabase-js';

interface Entry {
  id: string;
  user_id: string;
  medicine_name: string;
  image_urls: string[];
  created_at: string;
}

export default function Home() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [editText, setEditText] = useState('');
  const [editFiles, setEditFiles] = useState<File[]>([]);
  const [notification, setNotification] = useState<{message: string; type: 'success' | 'error'} | null>(null);
  const [entriesExpanded, setEntriesExpanded] = useState(true);

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      setLoading(false);
    };
    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchEntries = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (error) console.error(error);
    else setEntries(data || []);
  }, [user]);

  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000); // Auto-hide after 3 seconds
  };

  const filteredEntries = entries.filter(entry =>
    entry.medicine_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Load entries whenever we have a user session (on mount or after login)
  useEffect(() => {
    if (user) {
      fetchEntries();
    } else {
      setEntries([]);
    }
  }, [user, fetchEntries]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoading(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });

  const addMoreInputRef = useRef<HTMLInputElement>(null);

  const handleAddMoreClick = () => {
    addMoreInputRef.current?.click();
  };

  const handleAddMoreFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles(prevFiles => [...prevFiles, ...selectedFiles]);
    // Reset the input value so the same file can be selected again if needed
    event.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || files.length === 0 || !user) return;

    const imageUrls: string[] = [];
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      // Use crypto.randomUUID when available for stable deterministic length id, fallback to Math.random
      const unique = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const fileName = `${unique}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('images')
        .upload(`${user.id}/${fileName}`, file);
      if (error) {
        console.error(error);
        continue;
      }
      const { data: urlData } = supabase.storage
        .from('images')
        .getPublicUrl(`${user.id}/${fileName}`);
      // Persist storage path rather than public URL to avoid policy/public config drift
      imageUrls.push(`${user.id}/${fileName}`);
    }

    const { error } = await supabase
      .from('entries')
      .insert([{ user_id: user.id, medicine_name: text, image_urls: imageUrls }]);
    if (error) {
      console.error(error);
      showNotification('Upload unsuccessful', 'error');
    } else {
      setText('');
      setFiles([]);
      fetchEntries();
      showNotification('Upload successful', 'success');
    }
  };

  const exportCSV = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Entries');

    // Add headers
    worksheet.columns = [
      { header: 'Medicine Name', key: 'medicine_name', width: 30 },
      { header: 'Image Count', key: 'image_count', width: 15 }
    ];

    // Add data
    entries.forEach(entry => {
      worksheet.addRow({
        medicine_name: entry.medicine_name,
        image_count: entry.image_urls.length
      });
    });

    // Generate CSV and download
    const buffer = await workbook.csv.writeBuffer();
    const blob = new Blob([buffer], { type: 'text/csv' });
    saveAs(blob, 'entries.csv');
  };

  const exportXLSX = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Entries');

    // Add headers
    worksheet.columns = [
      { header: 'Medicine Name', key: 'medicine_name', width: 30 },
      { header: 'Image Count', key: 'image_count', width: 15 }
    ];

    // Add data
    entries.forEach(entry => {
      worksheet.addRow({
        medicine_name: entry.medicine_name,
        image_count: entry.image_urls.length
      });
    });

    // Generate XLSX and download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, 'entries.xlsx');
  };

  const exportZIP = async () => {
    const zip = new JSZip();
    for (const entry of entries) {
      const folderName = entry.medicine_name.replace(/[^a-zA-Z0-9]/g, '_');
      const folder = zip.folder(folderName);
      if (folder) {
        // Add text
        folder.file('medicine_name.txt', entry.medicine_name);
        // Download images and add to zip
        for (let idx = 0; idx < entry.image_urls.length; idx++) {
          const url = entry.image_urls[idx];
          try {
            const response = await fetch(url);
            const blob = await response.blob();
            const ext = url.split('.').pop() || 'jpg';
            folder.file(`image_${idx + 1}.${ext}`, blob);
          } catch (error) {
            console.error('Error downloading image:', error);
          }
        }
      }
    }
    const content = await zip.generateAsync({ type: 'blob' });
    saveAs(content, 'entries.zip');
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;

    // First, get the entry to know which images to delete
    const { data: entry, error: fetchError } = await supabase
      .from('entries')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('Error fetching entry:', fetchError);
      return;
    }

    // Delete images from storage
    if (entry && entry.image_urls && entry.image_urls.length > 0) {
      const { error: storageError } = await supabase.storage
        .from('images')
        .remove(entry.image_urls);
      if (storageError) {
        console.error('Error deleting image(s) from storage:', storageError);
      }
    }

    // Delete the entry from database
    const { error: deleteError } = await supabase.from('entries').delete().eq('id', id);
    if (deleteError) {
      console.error('Error deleting entry:', deleteError);
      showNotification('Delete unsuccessful', 'error');
    } else {
      fetchEntries();
      showNotification('Delete successful', 'success');
    }
  };

  const clearAll = async () => {
    if (!confirm('Are you sure you want to delete all entries?')) return;

    // Delete all images from storage first
    if (entries.length > 0) {
      const allPaths = entries.flatMap(e => e.image_urls || []);
      if (allPaths.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('images')
          .remove(allPaths);
        if (storageError) {
          console.error('Error deleting image(s) from storage:', storageError);
        }
      }
    }

    // Delete all entries from database
    const { error } = await supabase.from('entries').delete().eq('user_id', user?.id);
    if (error) {
      console.error(error);
      showNotification('Clear all unsuccessful', 'error');
    } else {
      setEntries([]);
      showNotification('Clear all successful', 'success');
    }
  };

  const startEditing = (entry: Entry) => {
    setEditingEntry(entry);
    setEditText(entry.medicine_name);
    setEditFiles([]);
  };

  const cancelEditing = () => {
    setEditingEntry(null);
    setEditText('');
    setEditFiles([]);
  };

  const removeImageFromEntry = (imagePath: string) => {
    if (!editingEntry) return;
    setEditingEntry({
      ...editingEntry,
      image_urls: editingEntry.image_urls.filter(url => url !== imagePath)
    });
  };

  const saveEditedEntry = async () => {
    if (!editingEntry || !editText.trim()) return;

    const newImageUrls: string[] = [...editingEntry.image_urls];

    // Upload new images
    for (const file of editFiles) {
      const fileExt = file.name.split('.').pop();
      const unique = (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
      const fileName = `${unique}.${fileExt}`;
      const { data, error } = await supabase.storage
        .from('images')
        .upload(`${user!.id}/${fileName}`, file);
      if (error) {
        console.error(error);
        continue;
      }
      newImageUrls.push(`${user!.id}/${fileName}`);
    }

    // Update the entry
    const { error } = await supabase
      .from('entries')
      .update({ 
        medicine_name: editText,
        image_urls: newImageUrls 
      })
      .eq('id', editingEntry.id);

    if (error) {
      console.error(error);
      showNotification('Update unsuccessful', 'error');
    } else {
      setEditingEntry(null);
      setEditText('');
      setEditFiles([]);
      fetchEntries();
      showNotification('Update successful', 'success');
    }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
        <form onSubmit={handleAuth} className="bg-gray-800 p-8 rounded shadow-md w-96">
          <h2 className="text-2xl mb-4">{isSignUp ? 'Sign Up' : 'Sign In'}</h2>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-2 mb-4 border border-gray-600 rounded bg-gray-700 text-white"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full p-2 mb-4 border border-gray-600 rounded bg-gray-700 text-white"
            required
          />
          <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700" disabled={loading}>
            {isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="w-full mt-2 text-blue-400">
            {isSignUp ? 'Already have an account? Sign In' : 'Need an account? Sign Up'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8 bg-gray-900 text-white" suppressHydrationWarning>
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded shadow-lg ${
          notification.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white`}>
          {notification.message}
        </div>
      )}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-bold">Medicine Data Entry</h1>
        <button onClick={handleSignOut} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
          Sign Out
        </button>
      </div>

      <form onSubmit={handleSubmit} className="mb-8 bg-gray-800 p-6 rounded shadow">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-white">Medicine Name</label>
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-white"
            required
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-2 text-white">Upload Images</label>
          <div {...getRootProps()} className="border-2 border-dashed border-gray-500 p-4 rounded cursor-pointer bg-gray-700">
            <input {...getInputProps()} />
            {isDragActive ? (
              <p className="text-white">Drop the files here...</p>
            ) : (
              <p className="text-white">Drag &apos;n&apos; drop some files here, or click to select files</p>
            )}
          </div>
          <input
            type="file"
            ref={addMoreInputRef}
            onChange={handleAddMoreFiles}
            multiple
            style={{ display: 'none' }}
          />
          {files.length > 0 && (
            <div className="mt-2">
              <p className="text-white">{files.length} file(s) selected</p>
              <button
                type="button"
                onClick={handleAddMoreClick}
                className="mt-2 bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-500 text-sm"
              >
                Add more images
              </button>
            </div>
          )}
        </div>

        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Save Entry
        </button>
      </form>

      <div className="mb-8">
        <div className="flex gap-4 mb-8">
          <button onClick={exportCSV} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Export CSV
          </button>
          <button onClick={exportXLSX} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Export XLSX
          </button>
          <button onClick={exportZIP} className="bg-purple-600 text-white px-4 py-2 rounded hover:bg-purple-700">
            Images (zip)
          </button>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={() => setEntriesExpanded(!entriesExpanded)}
              className="text-xl font-semibold text-white hover:text-gray-300 flex items-center"
              suppressHydrationWarning
            >
              <span>Entries ({filteredEntries.length})</span>
              <svg
                className={`ml-2 w-5 h-5 transition-transform ${entriesExpanded ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {entries.length > 0 && (
              <button onClick={clearAll} className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
                Clear All
              </button>
            )}
          </div>
          {entriesExpanded && (
            <>
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search entries by medicine name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-white placeholder-gray-400"
                />
              </div>
              <div className="transition-opacity duration-200">
                {filteredEntries.map((entry) => (
                  <div key={entry.id} className="bg-gray-800 p-4 rounded shadow mb-4">
                    {editingEntry?.id === entry.id ? (
                      // Edit mode
                      <div>
                        <div className="mb-4">
                          <label className="block text-sm font-medium mb-2 text-white">Medicine Name</label>
                          <input
                            type="text"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            className="w-full p-2 border border-gray-600 rounded bg-gray-700 text-white"
                          />
                        </div>
                        <div className="mb-4">
                          <label className="block text-sm font-medium mb-2 text-white">Current Images</label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {editingEntry.image_urls.map((img, idx) => (
                              <div key={idx} className="relative">
                                <img
                                  src={supabase.storage.from('images').getPublicUrl(img).data.publicUrl}
                                  alt={`Image ${idx + 1}`}
                                  className="w-20 h-20 object-cover rounded"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeImageFromEntry(img)}
                                  className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-700"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                          <div className="mb-2">
                            <input
                              type="file"
                              onChange={(e) => setEditFiles(Array.from(e.target.files || []))}
                              multiple
                              className="text-white"
                            />
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={saveEditedEntry}
                            className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={cancelEditing}
                            className="bg-gray-600 text-white px-3 py-1 rounded hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      // View mode
                      <>
                        <p className="text-white"><strong>Medicine Name:</strong> {entry.medicine_name}</p>
                        <p className="text-white"><strong>Images:</strong> {entry.image_urls.length}</p>
                        <div className="flex flex-wrap mt-2">
                          {entry.image_urls.slice(0, 3).map((img, idx) => (
                            <img
                              key={idx}
                              src={supabase.storage.from('images').getPublicUrl(img).data.publicUrl}
                              alt={`Image ${idx + 1}`}
                              className="w-20 h-20 object-cover mr-2 mb-2"
                            />
                          ))}
                          {entry.image_urls.length > 3 && <p className="text-white">+{entry.image_urls.length - 3} more</p>}
                        </div>
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => startEditing(entry)}
                            className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700"
                          >
                            Edit
                          </button>
                          <button onClick={() => deleteEntry(entry.id)} className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700">
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {filteredEntries.length === 0 && searchTerm && (
                  <p className="text-gray-400 text-center py-4">No entries found matching "{searchTerm}"</p>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>
  );
}