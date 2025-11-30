// Script to create superadmin user
// Run: node admin/create-superadmin.js

const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables:');
  console.error('   NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  console.error('   SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createSuperAdmin() {
  try {
    const email = 'abjandal@superadmin.com';
    const password = 'Abujandal19!';
    const name = 'Super Admin';

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email, is_admin')
      .eq('email', email)
      .maybeSingle();

    if (existingUser) {
      // Update existing user to superadmin
      const { data: updatedUser, error: updateError } = await supabase
        .from('users')
        .update({
          is_admin: true,
          role: 'superadmin',
          password: hashedPassword,
          is_verified: true,
          subscription_status: 'active',
          subscription_plan: 'admin',
          max_subaccounts: 999,
        })
        .eq('id', existingUser.id)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Error updating user:', updateError);
        process.exit(1);
      }

      console.log('✅ Superadmin updated successfully!');
      console.log('   Email:', email);
      console.log('   User ID:', updatedUser.id);
    } else {
      // Create new superadmin user
      const { data: newUser, error: createError } = await supabase
        .from('users')
        .insert({
          email: email,
          name: name,
          password: hashedPassword,
          is_verified: true,
          is_admin: true,
          role: 'superadmin',
          subscription_status: 'active',
          subscription_plan: 'admin',
          max_subaccounts: 999,
          trial_started_at: new Date().toISOString(),
          trial_ends_at: null,
        })
        .select()
        .single();

      if (createError) {
        console.error('❌ Error creating superadmin:', createError);
        process.exit(1);
      }

      console.log('✅ Superadmin created successfully!');
      console.log('   Email:', email);
      console.log('   User ID:', newUser.id);
    }

    console.log('\n🎉 You can now login to admin panel with:');
    console.log('   Email: abjandal@superadmin.com');
    console.log('   Password: Abujandal19!');
  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

createSuperAdmin();

