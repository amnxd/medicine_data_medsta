# Medicine Data Entry App

A Next.js web application for uploading images and text data, saving entries, and exporting data in CSV, XLSX, and ZIP formats. Now with Supabase authentication and storage.

## Features

- User authentication (Sign Up/Sign In) with Supabase
- Upload multiple images and enter medicine name for each entry
- Save entries to Supabase database and storage
- View list of saved entries with image previews
- Export data to CSV or XLSX (includes medicine name and image count)
- Download all images as a ZIP file with organized folders per entry
- Delete individual entries or clear all entries

## Setup Instructions

### 1. Create a Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be set up

### 2. Database Setup
Run the following SQL in your Supabase SQL Editor:

```sql
-- Create the entries table
CREATE TABLE entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  medicine_name TEXT NOT NULL,
  image_urls JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can view their own entries" ON entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own entries" ON entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own entries" ON entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own entries" ON entries
  FOR DELETE USING (auth.uid() = user_id);
```

### 3. Storage Setup
1. In your Supabase dashboard, click on "Storage" in the left sidebar
2. Click the "Create bucket" button
3. Name your bucket `images` (all lowercase)
4. **Important**: Uncheck "Public bucket" to keep it private
5. Click "Create bucket"

#### Creating Storage Policies
After creating the bucket, you need to create policies to control access. Click on the "Policies" tab in the Storage section.

**Create Policy 1: Allow users to view their own images**
1. Click "Create a policy"
2. Choose "For SELECT operations"
3. Policy name: `Users can view their own images`
4. In the SQL editor, paste:
```sql
bucket_id = 'images' 
AND auth.role() = 'authenticated' 
AND (storage.foldername(name))[1] = auth.uid()::text
```
5. Click "Save policy"

**Create Policy 2: Allow users to upload their own images**
1. Click "Create a policy" again
2. Choose "For INSERT operations"
3. Policy name: `Users can upload their own images`
4. In the SQL editor, paste:
```sql
bucket_id = 'images' 
AND auth.role() = 'authenticated' 
AND (storage.foldername(name))[1] = auth.uid()::text
```
5. Click "Save policy"

**Create Policy 3: Allow users to delete their own images**
1. Click "Create a policy" again
2. Choose "For DELETE operations"
3. Policy name: `Users can delete their own images`
4. In the SQL editor, paste:
```sql
bucket_id = 'images' 
AND auth.role() = 'authenticated' 
AND (storage.foldername(name))[1] = auth.uid()::text
```
5. Click "Save policy"

**Alternative: Using SQL Editor**
If you prefer, you can run all policies at once in the SQL Editor:
```sql
-- Allow authenticated users to view images in their own folder
CREATE POLICY "Users can view their own images" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'images' 
    AND auth.role() = 'authenticated' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to upload images to their own folder
CREATE POLICY "Users can upload their own images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'images' 
    AND auth.role() = 'authenticated' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow authenticated users to delete their own images
CREATE POLICY "Users can delete their own images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'images' 
    AND auth.role() = 'authenticated' 
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```

### 4. Environment Variables
Create a `.env.local` file in your project root with:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

You can find these values in your Supabase project settings under API.

## Getting Started

First, install dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Usage

1. Sign up or sign in with your email and password
2. Enter medicine name and upload images
3. Click "Save Entry" to store the data
4. View entries below and use the export buttons as needed
5. Use delete buttons to remove entries

## Technologies Used

- Next.js
- React
- TypeScript
- Tailwind CSS
- Supabase (Auth, Database, Storage)
- react-dropzone
- xlsx
- jszip
- file-saver
