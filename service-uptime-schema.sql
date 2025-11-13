-- Create service_uptime table for tracking historical service health
CREATE TABLE IF NOT EXISTS service_uptime (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  service_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('healthy', 'unhealthy', 'warning', 'checking')),
  message TEXT,
  details JSONB,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_service_uptime_user_service ON service_uptime(user_id, service_name);
CREATE INDEX IF NOT EXISTS idx_service_uptime_checked_at ON service_uptime(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_service_uptime_service_checked ON service_uptime(service_name, checked_at DESC);

-- Create index for recent data queries (no WHERE clause - use regular index)
-- Note: Cannot use NOW() in index predicate as it's VOLATILE
-- Use regular index and filter in queries instead
CREATE INDEX IF NOT EXISTS idx_service_uptime_recent ON service_uptime(user_id, service_name, checked_at DESC);

-- Add comment to table
COMMENT ON TABLE service_uptime IS 'Stores historical health check data for service uptime tracking';

-- Function to calculate uptime percentage
CREATE OR REPLACE FUNCTION calculate_uptime_percentage(
  p_user_id UUID,
  p_service_name VARCHAR,
  p_days INTEGER DEFAULT 90
)
RETURNS DECIMAL(5,2) AS $$
DECLARE
  v_total_checks INTEGER;
  v_healthy_checks INTEGER;
  v_uptime_percentage DECIMAL(5,2);
BEGIN
  -- Get total checks in the specified period
  SELECT COUNT(*)
  INTO v_total_checks
  FROM service_uptime
  WHERE user_id = p_user_id
    AND service_name = p_service_name
    AND checked_at > NOW() - (p_days || ' days')::INTERVAL;

  -- Get healthy checks
  SELECT COUNT(*)
  INTO v_healthy_checks
  FROM service_uptime
  WHERE user_id = p_user_id
    AND service_name = p_service_name
    AND status = 'healthy'
    AND checked_at > NOW() - (p_days || ' days')::INTERVAL;

  -- Calculate percentage
  IF v_total_checks > 0 THEN
    v_uptime_percentage := (v_healthy_checks::DECIMAL / v_total_checks::DECIMAL) * 100;
  ELSE
    v_uptime_percentage := 0;
  END IF;

  RETURN ROUND(v_uptime_percentage, 2);
END;
$$ LANGUAGE plpgsql;

