'use client';

import { useState, useEffect, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
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
  const [entriesExpanded, setEntriesExpanded] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || files.length === 0 || !user) return;

    const imageUrls: string[] = [];
    for (const file of files) {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random()}.${fileExt}`;
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
      imageUrls.push(urlData.publicUrl);
    }

    const { error } = await supabase
      .from('entries')
      .insert([{ user_id: user.id, medicine_name: text, image_urls: imageUrls }]);
    if (error) console.error(error);
    else {
      setText('');
      setFiles([]);
      fetchEntries();
    }
  };

  const exportCSV = () => {
    const data = entries.map(e => ({ 'Medicine Name': e.medicine_name, 'Image Count': e.image_urls.length }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entries');
    XLSX.writeFile(wb, 'entries.csv');
  };

  const exportXLSX = () => {
    const data = entries.map(e => ({ 'Medicine Name': e.medicine_name, 'Image Count': e.image_urls.length }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entries');
    XLSX.writeFile(wb, 'entries.xlsx');
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
    const { error } = await supabase.from('entries').delete().eq('id', id);
    if (error) console.error(error);
    else fetchEntries();
  };

  const clearAll = async () => {
    if (!confirm('Are you sure you want to delete all entries?')) return;
    const { error } = await supabase.from('entries').delete().eq('user_id', user?.id);
    if (error) console.error(error);
    else setEntries([]);
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
    <div className="min-h-screen p-8 bg-gray-900 text-white">
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
          {files.length > 0 && (
            <p className="mt-2 text-white">{files.length} file(s) selected</p>
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
            >
              <span>Entries ({entries.length})</span>
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
          {entriesExpanded && entries.map((entry) => (
            <div key={entry.id} className="bg-gray-800 p-4 rounded shadow mb-4">
              <p className="text-white"><strong>Medicine Name:</strong> {entry.medicine_name}</p>
              <p className="text-white"><strong>Images:</strong> {entry.image_urls.length}</p>
              <div className="flex flex-wrap mt-2">
                {entry.image_urls.slice(0, 3).map((img, idx) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={idx} src={img} alt={`Image ${idx + 1}`} className="w-20 h-20 object-cover mr-2 mb-2" />
                ))}
                {entry.image_urls.length > 3 && <p className="text-white">+{entry.image_urls.length - 3} more</p>}
              </div>
              <button onClick={() => deleteEntry(entry.id)} className="mt-2 bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
